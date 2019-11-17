🏁 MKTM
----
Simple dependency-free node script to organize Mario Kart championships.

## Installation

```bash
npm i -g mario-kart-tournament-maker
```

## Usage

```bash
$ mktm

Mario Kart Tournament Maker
Usage: mktm <command> [options]

COMMANDS

  new
    Creates a new tournament.
    Options:
    --rounds NUMBER, -r NUMBER
            Number of rounds of the tournament. Default: 3
    --players NAME1 NAME2..., -p NAME1 NAME2...
            Names of the players. Without this option, you'll be prompted to provided them.
    --lazy NUMBER, -l NUMBER
            Creates a new game only with a number of players, default names will be attributed.
  
  add
    Add a new player to the tournament, ONLY if still on round 1.
    Options:
    --players NAME1 NAME2..., -p NAME1 NAME2...
            Names of the new players. Without this option, you'll be prompted to provided them.
    --lazy NUMBER, -l NUMBER
            Add a specific number of players, default names will be attributed.

  status
    Displays the tournament's matches status.
    
  results [MATCH_NB]
    Enters the results of a match. If no match number provided, will ask for the results of the first unfinished match.
    
  leaderboard
    Displays the leaderboard.

GLOBAL OPTIONS
    
    --file FILE, -f FILE
            Path of the tournament save file to write to / read from. Default: mktm-tournament.json
            Can also be provided through the env variable MKTM_FILE.

```

or for those who just downloaded the script

```bash
$ ./cli.js
```

## Tournament organization

When the game starts, players are randomly distributed into matches of 4 or less participants. When players finish a match (whether it's a race or a whole cup), they can fill the score before moving on to the next match.

When all the matches of a round are over and results are set, the next round is calculated by grouping players of similar level.

When all the rounds are over, the tournament is finished and the final leaderboard is displayed!