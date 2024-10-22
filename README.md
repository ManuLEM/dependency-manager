# Ticket Management and Gantt Chart Generator

This TypeScript script processes a list of tasks or tickets, orders them based on effort (story points), business value, and dependencies, assigns them to given teams, and generates a Gantt chart in a CSV file.

## Table of Contents

- [Ticket Management and Gantt Chart Generator](#ticket-management-and-gantt-chart-generator)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Usage](#usage)
  - [Input Files](#input-files)
    - [Tickets File](#tickets-file)
    - [Teams File](#teams-file)
  - [Output Files](#output-files)
  - [Functions](#functions)

## Installation

1. Clone the repository:

    ```sh
    git clone <repository-url>
    cd <repository-directory>
    ```

2. Install the dependencies:
    ```sh
    npm install
    ```

## Usage

To run the script, use the following command:

```sh
npx ts-node . <path-to-tickets-file> <path-to-teams-file>
```

Replace `<path-to-tickets-file>` and `<path-to-teams-file>` with the paths to your tickets and teams files, respectively.

## Input Files

### Tickets File

The tickets file should be a CSV file with the following columns:

-   `id`: The unique identifier of the ticket.
-   `title`: The title of the ticket.
-   `blockedBy`: A list of ticket IDs that block this ticket, split by hyphen.
-   `businessValue`: The business value of the ticket.
-   `storyPoints`: The effort or story points required to complete the ticket.
-   `potentialTeam`: A list of team names that can potentially work on this ticket, split by hyphen.

### Teams File

The teams file should be a JSON file with the following structure:

```jsonc
[
    {
        "id": "1",
        "name": "Team A",
        "velocity": 15, // number
    },
    {
        "id": "2",
        "name": "Team B",
        "velocity": 10, // number
    },
]
```

Each team should have a `id`, a `name` and a `velocity`.

## Output Files

The script generates the following output files in the `output` directory:

-   `sorted-tickets.csv`: A CSV file containing the sorted list of tickets.
-   `gantt.csv`: A CSV file representing the Gantt chart for visualization.

## Functions

`main`

The main function reads the CSV file, sorts the tickets, assigns them to teams, and generates a Gantt chart.

`loadTeamsJSON`

Loads the teams from the JSON file.

`addTicketToList`

Adds a ticket to the list of visited tickets, recursively adding the tickets that are blocking it.

`getSum`

Gets the sum of a ticket's dependencies recursively for a given key.

`sortTickets`

Orders tickets by dependencies and ratio of business value to story points.

`pickNextTeam`

Picks the next team to work on the tickets.

`generateGanttChart`

Creates a Gantt chart and saves it to a CSV file for visualization.
