import * as path from 'path';
import { parse } from 'csv-parse';
import { readFile, writeFile } from 'fs/promises';

interface Ticket {
    id: string;
    title: string;
    blockedBy: string[];
    businessValue: number;
    storyPoints: number;
    potentialTeam: string[];
}

interface Team {
    id: string;
    name: string;
    velocity: number;
    sprints: Ticket[];
}

const [, , ticketFile, teamFile] = process.argv;

let teams: Team[] = [];

async function loadTeamsJSON() {
    teams = JSON.parse(await readFile(teamFile, 'utf-8'));
    // Initialize the sprints for each team
    teams.forEach(team => {
        team.sprints = [];
    });
}

/**
 * Adds a ticket to the list of visited tickets, recursively adding the tickets that are blocking it
 * @param ticketId Id of the ticket to add to the list
 * @param visitedTickets Ids of the tickets that have already been visited to avoid duplicates
 * @param ticketsMap Map of tickets to get the ticket object by id
 * @returns
 */
function addTicketToList(
    ticketId: string,
    visitedTickets: Set<string>,
    ticketsMap: Map<string, Ticket>,
): Set<string> {
    const currentTicket = ticketsMap.get(ticketId);
    if (!currentTicket) return visitedTickets;

    currentTicket.blockedBy?.forEach(blockedBy => {
        addTicketToList(blockedBy, visitedTickets, ticketsMap);
    });

    visitedTickets.add(ticketId);
    return visitedTickets;
}

/**
 * Gets the sum of a ticket's dependencies recursively for a given key
 * @param key The key of the ticket object that we want to sum with its dependencies
 * @param ticketId The id of the ticket to get the sum of its dependencies
 * @param ticketsMap Map of tickets to get the ticket object by id
 * @returns
 */
function getSum(
    key: 'businessValue' | 'storyPoints',
    ticketId: string,
    ticketsMap: Map<string, Ticket>,
): number {
    const ticket = ticketsMap.get(ticketId);
    if (!ticket) return 0;
    if (!ticket.blockedBy.length) return ticket[key];
    return ticket.blockedBy.reduce(
        (acc, blockedBy) => acc + getSum(key, blockedBy, ticketsMap),
        ticket[key],
    );
}

/**
 * Orders tickets by dependencies and ratio of business value to story points
 * @param tickets Original list of tickets
 * @returns list of tickets sorted by dependencies and ratio of business value to story points
 */
function sortTickets(tickets: Ticket[], ticketsMap: Map<string, Ticket>): Ticket[] {
    const sortedTickets = new Set<string>();

    tickets
        .sort((a, b) => {
            const ratioA =
                getSum('businessValue', a.id, ticketsMap) / getSum('storyPoints', a.id, ticketsMap);
            const ratioB =
                getSum('businessValue', b.id, ticketsMap) / getSum('storyPoints', b.id, ticketsMap);
            return ratioB - ratioA;
        })
        .forEach(ticket => {
            addTicketToList(ticket.id, sortedTickets, ticketsMap);
        });

    return Array.from(sortedTickets).map(ticketId => ticketsMap.get(ticketId)!);
}

/**
 * Picks the next team to work on the tickets
 * @param teams List of teams
 * @param nextSprintByTeam Map of the next sprint each team is going to work on
 * @returns The team that is going to work on the next ticket
 */
function pickNextTeam(teams: Team[], nextSprintByTeam: Map<string, number>): Team {
    return teams.reduce((currentResult, team) => {
        const nextSprintA = nextSprintByTeam.get(team.name) || 0;
        const nextSprintB = nextSprintByTeam.get(currentResult.name) || 0;
        if (nextSprintA === nextSprintB) {
            const filledSprintsA = team.sprints.filter(sprint => sprint).length;
            const filledSprintsB = currentResult.sprints.filter(sprint => sprint).length;
            return filledSprintsA < filledSprintsB ? team : currentResult;
        }

        return nextSprintA < nextSprintB ? team : currentResult;
    }, teams[0]);
}

async function generateGanttChart(teams: Team[]) {
    // Get the number of sprints needed to finish all the tickets
    const lastSprint = Math.max(...teams.map(team => team.sprints.length));
    const visitedTickets = new Set<string>();

    await writeFile(
        path.resolve(__dirname, '../output/gantt.csv'),
        [
            // Create the header of the CSV file, using the number of sprints to generate all needed columns
            `Team name,Ticket ID,Title,${Array(lastSprint)
                .fill('')
                .map((_, index) => `Sprint ${index + 1}`)
                .join(',')}`,
            ...teams
                .map(team =>
                    team.sprints.reduce<string[][]>((ticketLines, ticket, index) => {
                        if (!ticket) return ticketLines;
                        if (!visitedTickets.has(ticket.id)) {
                            ticketLines.push([
                                team.name,
                                ticket.id,
                                ticket.title,
                                ...team.sprints.map(() => ''),
                            ]);
                        }
                        visitedTickets.add(ticket.id);
                        ticketLines[ticketLines.length - 1][index + 3] = 'X';

                        return ticketLines;
                    }, []),
                )
                .flat()
                .map(line => line.join(',')),
        ].join('\n'),
    );
}
/**
 * Main function, reads the CSV file and sorts the tickets
 */
export async function main() {
    await loadTeamsJSON();
    const ticketFilePath = path.resolve(__dirname, '..', ticketFile);

    const headers = ['id', 'title', 'blockedBy', 'businessValue', 'storyPoints', 'potentialTeam'];
    const ticketsFileContent = await readFile(ticketFilePath, { encoding: 'utf-8' });

    parse(
        ticketsFileContent,
        {
            delimiter: ',',
            columns: headers,
            fromLine: 2,
            cast: (columnValue, context) => {
                if (context.column === 'blockedBy' || context.column === 'potentialTeam') {
                    return columnValue.length ? columnValue.split('-') : [];
                } else if (context.column === 'businessValue' || context.column === 'storyPoints') {
                    return Number(columnValue);
                }
                return columnValue;
            },
        },
        async (error, result: Ticket[]) => {
            if (error) {
                console.error(error);
            }

            // Create a map of tickets to get the ticket object by id
            const ticketsMap = new Map<string, Ticket>();
            result.forEach(ticket => {
                ticketsMap.set(ticket.id, ticket);
            });

            // Get the list of tickets simply sorted by dependencies, business value and story points
            const sortedTickets = sortTickets(result, ticketsMap);

            // Save that list to a CSV file as it can be useful for human intervention
            await writeFile(
                path.resolve(__dirname, '../output/sorted-tickets.csv'),
                [
                    'Ticket ID,Ticket Title',
                    ...sortedTickets.map(ticket => [ticket.id, ticket.title].join(',')),
                ].join('\n'),
            );

            const nextSprintByTeam = new Map<string, number>();
            const ticketsDoneOnSprint = new Map<string, number>();
            // Start with the first team
            let team = teams[0];

            // Loop through the tickets until all of them are assigned to a team
            while (ticketsDoneOnSprint.size < sortedTickets.length) {
                const nextSprint = nextSprintByTeam.get(team.name) || 0;

                // Find the first ticket that the team can work on
                // A ticket can be worked on if it's not done yet,
                // it's not blocked by any ticket that is not done yet,
                // and if the team is in the potential teams of the ticket
                const ticket = sortedTickets.find(
                    ticket =>
                        ticket.potentialTeam.includes(team.id) &&
                        !ticketsDoneOnSprint.has(ticket.id) &&
                        (!ticket.blockedBy.length ||
                            ticket.blockedBy.every(
                                blockedBy =>
                                    ticketsDoneOnSprint.has(blockedBy) &&
                                    ticketsDoneOnSprint.get(blockedBy)! < nextSprint,
                            )),
                );
                // This team can't work on any ticket in the next sprint
                if (!ticket) {
                    // We increment the available sprint for this team so next iteration could have better luck
                    nextSprintByTeam.set(team.name, (nextSprintByTeam.get(team.name) || 0) + 1);
                    // We move on to the next team, hoping to unblock the current team a little further down the line
                    team = pickNextTeam(
                        teams.filter(t => t.id !== team.id),
                        nextSprintByTeam,
                    );
                    continue;
                }

                // Calculate the amount of sprints needed to finish the ticket
                // Assign the ticket to the team for the needed sprints
                const sprintsNeeded = Math.ceil(ticket.storyPoints / team.velocity);
                const ticketEndSprint = nextSprint + sprintsNeeded;
                for (let i = nextSprint; i < ticketEndSprint; i++) {
                    team.sprints[i] = ticket!;
                }
                nextSprintByTeam.set(team.name, ticketEndSprint);
                ticketsDoneOnSprint.set(ticket.id, ticketEndSprint - 1);

                // We move on to the next team
                team = pickNextTeam(teams, nextSprintByTeam);
            }

            // Create a Gantt chart and save it to a CSV file for visualization
            await generateGanttChart(teams);
        },
    );
}
