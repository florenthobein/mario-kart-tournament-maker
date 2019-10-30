// todo: refacto code structure
// todo: warning before overriding an existing tournament
// todo: think about a real distribution formula for bestAmountOfPlayersPerRace

const fs = require("fs");

const args = process.argv.slice(2);
if (!args) return;

const MAX_PLAYER_PER_RACE = 4; // doesn't support 8

const DEFAULT_ROUND_NB = 3;

const MKTM_FILE = process.env.MKTM_FILE || 'mktm-tournament.json';

const ACTION_KEY = '_action';
const ACTION_ARGS_KEY = '_action_args';

const log = {
    line: (t, nl = true) => process.stdout.write(t + (nl ? `\n` : '')),
    error: (t) => { log.line(log.format.red(t)); process.exit(); },
    format: {
        bold: t => `\x1b[1m${t}\x1b[22m`,
        grey: t => `\x1b[90m${t}\x1b[0m`,
        blue: t => `\x1b[36m${t}\x1b[0m`,
        yellow: t => `\x1b[33m${t}\x1b[0m`,
        red: t => `\x1b[31m${t}\x1b[0m`,
    }
};

const array = {
    shuffle: (a) => {
        const res = [...a];
        for (let i = res.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [res[i], res[j]] = [res[j], res[i]];
        }
        return res;
    },
    max: a => a.reduce((acc, v) => (v > acc) ? v : acc, 0), // [1, 4, 2] => 4
};

const formatArgs = (args) => {
    let currentParam;
    return args.reduce((acc, value) => {
        const reg = /^\-+/;
        if (reg.test(value)) {
            currentParam = value.replace(reg, '');
            acc[currentParam] = true;
        } else {
            switch (typeof acc[currentParam]) {
                case 'undefined':
                    if (!acc[ACTION_KEY]) {
                        acc[ACTION_KEY] = value;
                        currentParam = ACTION_ARGS_KEY;
                    } else {
                        acc[ACTION_ARGS_KEY] = [value];
                    }
                    break;
                case 'boolean': acc[currentParam] = value; break;
                case 'string': acc[currentParam] = [acc[currentParam], value]; break;
                case 'object': acc[currentParam].push(value); break;
            }
        }
        return acc;
    }, {});
};

const startTournament = (saveTo, playerNames = undefined, lazy = undefined, roundNb = undefined) => {
    if (lazy && !isNaN(+lazy)) {
        playerNames = [];
        for (let i = 0; i < Math.abs(+lazy); i++) playerNames.push(`Player${i+1}`);
    }
    if (isNaN(+roundNb) || +roundNb < 1) log.error('Not a valid round number');
    if (!playerNames) startTournamentFromPrompt(roundNb, saveTo);
    else startTournamentFromPlayerNames(playerNames, roundNb, saveTo);
};

const startTournamentFromPrompt = (roundNb, saveTo) => {
    const stdIn = process.stdin;
    stdIn.setEncoding('utf-8');

    const playerNames = [];

    log.line(`${log.format.bold('Register the players')} ${log.format.grey('(empty line to finish)')}`);

    const logPlayerNames = () => log.line(`Player ${playerNames.length + 1}: `, false);
    logPlayerNames();

    stdIn.on('data', (name) => {
        if (name === '\n') {
            log.line(log.format.bold(`Tournament created!`));
            startTournamentFromPlayerNames(playerNames, roundNb, saveTo);
            process.exit();
        } else {
            playerNames.push(name.replace(/ /g, '').replace('\n', ''));
            logPlayerNames();
        }
    });
};

const startTournamentFromPlayerNames = (playerNames, roundNb, saveTo) => {
    const tournamentData = initTournament(playerNames, roundNb);
    log.line('');
    log.line(log.format.bold('Welcome to the new tournament!'));
    log.line(log.format.grey(`Nb. of rounds: ${tournamentData.rounds}`));
    displayTournament(tournamentData);
    saveTournamentFile(tournamentData, saveTo);
};

const initNewRound = (players, globalShuffle = true) => {
    const formatPlayer = (playerName) => ({ name: playerName });
    const bestAmountOfPlayersPerRace = (playersNb) =>
        (playersNb > 9 ||
         playersNb % MAX_PLAYER_PER_RACE === 0 ||
         playersNb % MAX_PLAYER_PER_RACE > MAX_PLAYER_PER_RACE / 2) ?
            MAX_PLAYER_PER_RACE :
            MAX_PLAYER_PER_RACE - 1;
    if (globalShuffle) players = array.shuffle(players);
    const races = [];
    while (players.length) {
        let racePlayers = players.splice(0, bestAmountOfPlayersPerRace(players.length));
        if (!globalShuffle) racePlayers = array.shuffle(racePlayers);
        races.push(racePlayers.map(formatPlayer));
    }
    return races;
};

const initTournament = (playerNames, roundNb) => {
    const playerSet = new Set(playerNames);
    return {
        players: [...playerSet],
        rounds: roundNb,
        races: initNewRound([...playerSet]),
    };
};

const getLeaderboard = (tournamentData) => {
    if (!tournamentData || !tournamentData.players || !tournamentData.races) return [];
    const raceToIndex = race => (race || []).reduce((acc, p) => ({ ...acc, [p.name]: p.score || 0 }), {});
    const leaderboardIndex = tournamentData.races.reduce((acc, race) => {
        const scoreIndex = raceToIndex(race);
        Object.keys(scoreIndex).map(k => { acc[k] = (acc[k] || 0) + scoreIndex[k] });
        return acc;
    }, {});
    return Object.keys(leaderboardIndex).map(k => ({ name: k, score: leaderboardIndex[k] })).sort((a, b) => b.score - a.score);
};

const displayTournament = (tournamentData, showLeaderboard = false) => {
    if (!tournamentData || !tournamentData.players || !tournamentData.races) return;

    let longestLineLength = array.max(tournamentData.races.map(r =>
        array.max(r.map(p => p.name.length + String(p.score || '').length))));

    const formatResultLine = (padLength = 0, medalIndex = {}) => (player) =>
        log.format.blue(player.name) +
        log.format.grey(''.padStart(padLength - player.name.length - String(player.score || '').length, '.')) +
        log.format.yellow(String(player.score || '')) +
        (medalIndex[player.score] ? ` ${medalIndex[player.score]}` : '');

    log.line('');

    if (showLeaderboard) {
        const leaderboard = getLeaderboard(tournamentData);
        longestLineLength = array.max(leaderboard.map(p => p.name.length + String(p.score || '').length));
        const medals = ['🥇', '🥈', '🥉'];
        const medalIndex = leaderboard.reduce((acc, p) => {
            if (acc[p.score]) {
                medals.shift();
                return acc;
            }
            return { ...acc, [p.score]: medals.shift() }
        }, {});
        log.line(`🏆 Leaderboard\n` +
            leaderboard
                .map(formatResultLine(longestLineLength+1, medalIndex))
                .join(`\n`) + '\n');
        return;
    }

    for (let i in tournamentData.races) {
        log.line(`🏁 Race ${1 + Number(i)}\n` +
            tournamentData.races[i]
                .sort((a, b) => b.score - a.score)
                .map(formatResultLine(longestLineLength+1))
                .join(`\n`) + '\n');
    }
};

const readTournamentFromFile = (file, showLeaderboard = false) => {
    if (!fs.existsSync(file)) log.error(`Tournament file ${file} does not exist`);
    fs.readFile(file, { encoding: 'utf-8' }, (err, fileContent) => {
        if (err) throw err;
        const tournamentData = JSON.parse(fileContent);
        if (!tournamentData) log.error(`Can't read file ${file}`);
        displayTournament(tournamentData, showLeaderboard);
    });
};

const saveTournamentFile = (tournamentData, saveTo, verbose = true) => {
    if (!saveTo) return;
    const fileContent = JSON.stringify(tournamentData);
    fs.writeFileSync(saveTo, fileContent);
    if (verbose) log.line(`Successfully saved tournament to ${log.format.bold(saveTo)}`);
};

const startSaveRaceResults = (raceNb, file) => {
    fs.readFile(file, { encoding: 'utf-8' }, (err, fileContent) => {
        if (err) throw err;
        const tournamentData = JSON.parse(fileContent);
        if (!tournamentData || !tournamentData.races) log.error(`Can't read file ${file}`);
        askResultsForRaceResults(tournamentData, raceNb || getLastUnfinishedRace(tournamentData), file);
    });
};

const askResultsForRaceResults = (tournamentData, raceNb, file) => {
    if (!tournamentData.races.length || !tournamentData.races[raceNb-1]) log.error(`Wrong race nb`);
    const race = [...tournamentData.races[raceNb-1]];
    if (!race.length || typeof race[0].score !== 'undefined') log.error(`Race already processed`);

    const stdIn = process.stdin;
    stdIn.setEncoding('utf-8');

    let currentPlayer;
    const playerNameIndex = {};
    const playerNames = race.map(p => {
        playerNameIndex[p.name] = p;
        return p.name;
    });

    const askPlayerScore = (dry = false) => {
        const playerName = !dry ? playerNames.pop() : currentPlayer;
        if (!playerName) return null;
        log.line(`Score of ${playerName}: `, false);
        return playerName;
    };

    log.line(log.format.bold(`Results of race ${raceNb}`));
    currentPlayer = askPlayerScore();

    stdIn.on('data', (data) => {
        const score = +data;
        if (isNaN(score)) {
            log.line(log.format.red(`Invalid score`));
            askPlayerScore(true);
            return;
        }
        playerNameIndex[currentPlayer].score = score;
        currentPlayer = askPlayerScore();
        if (!currentPlayer) {
            const isTournamentFinished = saveTournamentResults(tournamentData, raceNb, race, file);
            if (!isTournamentFinished) {
                displayTournament(tournamentData);
                log.line(log.format.bold(`Tournament updated!`));
            } else {
                log.line('');
                log.line(log.format.bold(`Tournament completed!`));
                displayTournament(tournamentData, true);
            }
            process.exit();
        }
    });
};

const saveTournamentResults = (tournamentData, raceNb, raceData, file) => {
    // read again in case someone else has used the file
    const fileContent = fs.readFileSync(file, { encoding: 'utf-8' });
    const actualTournamentData = JSON.parse(fileContent);
    if (!actualTournamentData) log.error(`Can't read file ${file}`);
    actualTournamentData.races[raceNb-1] = raceData;
    tournamentData.races = actualTournamentData.races;
    const isTournamentFinished = checkForNewRound(tournamentData);
    saveTournamentFile(tournamentData, file, false);
    return isTournamentFinished;
};

const isRaceFinished = (tournamentData, i) =>
    (tournamentData.races[i] || []).reduce((acc, l) => acc && typeof l.score !== 'undefined', true);

const getLastUnfinishedRace = (tournamentData) => {
    for (let i in tournamentData.races) {
        if (!isRaceFinished(tournamentData, +i)) return (+i)+1;
    }
    log.error(`No unfinished race ${file}`);
};

const checkForNewRound = (tournamentData) => {
    const playerTotal = tournamentData.players.length;
    const racesPerRound = Math.floor(playerTotal / MAX_PLAYER_PER_RACE); // is it true, though
    const roundTotal = tournamentData.rounds;

    const roundExists = roundNb => !!tournamentData.races[roundNb * racesPerRound];
    const isLastRound = roundNb => roundNb === roundTotal - 1;

    for (let roundNb = 0; roundNb < roundTotal; roundNb++) {
        let isRoundFinished = true;
        for (let raceNb = 0; raceNb < racesPerRound; raceNb++) {
            isRoundFinished = isRoundFinished && isRaceFinished(tournamentData, roundNb * racesPerRound + raceNb);
        }
        if (!isRoundFinished) break;
        if (isLastRound(roundNb)) return true;
        if (roundExists(roundNb+1)) continue;
        initNewRound(getLeaderboard(tournamentData).map(p => p.name), false)
            .map(race => tournamentData.races.push(race));
        break;
    }

    return false;
};

const callCmd = `node ${__filename.split(/\//g).pop()}`;
const params = formatArgs(args);

switch (params[ACTION_KEY]) {
    case 'new':
        startTournament(params.file || MKTM_FILE, params.players, params.lazy, params.round || DEFAULT_ROUND_NB);
        break;
    case 'status':
        readTournamentFromFile(params.file || MKTM_FILE);
        break;
    case 'results':
        const roundNb = params[ACTION_ARGS_KEY] && params[ACTION_ARGS_KEY].length && !isNaN(+params[ACTION_ARGS_KEY][0]) ?
            +params[ACTION_ARGS_KEY][0] : 0;
        startSaveRaceResults(roundNb, params.file || MKTM_FILE);
        break;
    case 'leaderboard':
        readTournamentFromFile(params.file || MKTM_FILE, true);
        break;
    default:
        log.line(`${log.format.bold('Mario Kart Tournament Maker')}
Usage:
> ${log.format.blue(callCmd)} new [--round roundNb] [--file filename] [--players player1 player2 player3...] [--lazy playerNb]
  ${log.format.grey('Creates a new tournament')}
> ${log.format.blue(callCmd)} status [--file filename]
  ${log.format.grey('Displays existing tournament')}
> ${log.format.blue(callCmd)} results [raceNb] [--file filename]
  ${log.format.grey('Enters the results of a race')}
> ${log.format.blue(callCmd)} leaderboard [--file filename]
  ${log.format.grey('Show the leaderboard')}`);
}
