const fs = require("fs");

const args = process.argv.slice(2);
if (!args) return;

const MAX_PLAYER_PER_RACE = 4; // doesn't support 8

const DEFAULT_ROUND_NB = 3;

const DEFAULT_MKTM_FILE = 'mktm-tournament.json';
const MKTM_FILE = process.env.MKTM_FILE || DEFAULT_MKTM_FILE;

const ACTION_KEY = '_action';
const ACTION_ARGS_KEY = '_action_args';

const log = {
    line: (t, nl = true) => process.stdout.write(t + (nl ? `\n` : '')),
    error: (t) => { log.line(log.format.red(`ERROR: ${t}`)); process.exit(); },
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

class TournamentHelper {
    static readTournamentFile(file) {
        if (!fs.existsSync(file)) log.error(`Tournament file ${file} does not exist`);
        const fileContent = fs.readFileSync(file, { encoding: 'utf-8' });
        const tournamentData = JSON.parse(fileContent);
        if (!tournamentData) log.error(`Can't read file ${file}`);
        return tournamentData;
    }

    static writeTournamentFile(tournamentData, file) {
        if (!file) return;
        const fileContent = JSON.stringify(tournamentData);
        fs.writeFileSync(file, fileContent);
    }

    static generateDefaultPlayerNames(quantity, values = []) {
        return quantity > 0 ? TournamentHelper.generateDefaultPlayerNames(quantity - 1, [`Player${quantity}`, ...values]) : values;
    }

    static formatPlayer(playerName) {
        return { name: playerName };
    }

    static isRaceFinished(tournamentData, i) {
        return (tournamentData.races[i] || []).reduce((acc, l) => acc && typeof l.score !== 'undefined', true);
    }

    static isRaceFull(tournamentData, i) {
        return tournamentData.races[i].length >= MAX_PLAYER_PER_RACE;
    }

    static getFirstNotFullRace(tournamentData) {
        for (let i in tournamentData.races) {
            if (!TournamentHelper.isRaceFull(tournamentData, +i)) return tournamentData.races[i];
        }
        return null;
    }

    static getLastUnfinishedRace(tournamentData) {
        for (let i in tournamentData.races) {
            if (!TournamentHelper.isRaceFinished(tournamentData, +i)) return (+i)+1;
        }
        return null;
    }

    static getRaceQuantityPerRound(tournamentData) {
        const playerTotal = tournamentData.players.length;
        return Math.ceil(playerTotal / MAX_PLAYER_PER_RACE); // is it true, though
    }

    static getCurrentRound(tournamentData) {
        const racesPerRound = TournamentHelper.getRaceQuantityPerRound(tournamentData);
        return Math.floor(tournamentData.races.length / racesPerRound);
    }
}

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

const startTournament = (data) => {
    const { file: saveTo, players: givenPlayerNames, lazy, rounds } = data;
    const generatedPlayerNames = lazy && !isNaN(+lazy) ? TournamentHelper.generateDefaultPlayerNames(+lazy) : null;
    const playerNames = generatedPlayerNames || givenPlayerNames;
    if (isNaN(+rounds) || +rounds < 1) log.error('Not a valid round number');
    checkExistingTournamentFile(saveTo)
        .then(() => !playerNames ? askForPlayerNames() : false)
        .then(askedPlayerNames => {
            startTournamentFromPlayerNames(askedPlayerNames || playerNames, rounds, saveTo);
            process.exit();
        })
        .catch(() => {
            log.line(`Creation aborted`);
            process.exit();
        });
};

const addPlayers = (data) => {
    const { file, players: givenPlayerNames, lazy } = data;
    const generatedPlayerNames = lazy && !isNaN(+lazy) ? TournamentHelper.generateDefaultPlayerNames(+lazy) : null;
    const playerNames = generatedPlayerNames || givenPlayerNames;
    const tournamentData = TournamentHelper.readTournamentFile(file);
    const currentRound = TournamentHelper.getCurrentRound(tournamentData);
    if (currentRound > 1) log.error(`Too late to add players!`);
    (!(playerNames) ? askForPlayerNames('Register the new players') : Promise.resolve())
        .then(askedPlayerNames => {
            const newPlayerNames = askedPlayerNames || playerNames;
            if (!newPlayerNames || !newPlayerNames.length) log.error('Wrong player names');
            tournamentData.players = [...tournamentData.players, ...newPlayerNames];
            while (!!newPlayerNames.length) {
                const notFullRace = TournamentHelper.getFirstNotFullRace(tournamentData);
                console.log('notFullRace', notFullRace);
                const formattedPlayer = TournamentHelper.formatPlayer(newPlayerNames.pop());
                if (notFullRace) notFullRace.push(formattedPlayer);
                else tournamentData.races.push([formattedPlayer]);
            }
            displayTournament(tournamentData);
            TournamentHelper.writeTournamentFile(tournamentData, file);
            process.exit();
        })
        .catch(() => {
            log.line(`Operation aborted`);
            process.exit();
        });
};

const askForPlayerNames = (text = 'Register the players') => {
    const promise = new Promise(function(resolve, reject) {
        const stdIn = process.stdin;
        stdIn.setEncoding('utf-8');

        const playerNames = [];

        log.line(`${log.format.bold(text)} ${log.format.grey('(empty line to finish)')}`);

        const logPlayerNames = () => log.line(`Player ${playerNames.length + 1}: `, false);
        logPlayerNames();

        stdIn.on('data', (name) => {
            if (name === '\n' && !playerNames.length) {
                reject();
            } else if (name === '\n') {
                resolve(playerNames);
            } else {
                playerNames.push(name.replace(/ /g, '').replace('\n', ''));
                logPlayerNames();
            }
        });
    });

    return promise;
};

const startTournamentFromPlayerNames = (playerNames, roundNb, saveTo) => {
    const tournamentData = initTournament(playerNames, roundNb);
    log.line('');
    log.line(log.format.bold('Welcome to the new tournament!'));
    displayTournament(tournamentData);
    TournamentHelper.writeTournamentFile(tournamentData, saveTo);
    log.line(`Successfully saved tournament to ${log.format.bold(saveTo)}`);
};

const initNewRound = (players, globalShuffle = true) => {
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
        races.push(racePlayers.map(TournamentHelper.formatPlayer));
    }
    return races;
};

const initTournament = (playerNames, roundNb) => {
    const playerSet = new Set(playerNames);
    return {
        rounds: roundNb,
        created: Date.now(),
        players: [...playerSet],
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

    log.line('');
    log.line(log.format.grey(`Created on: ${new Date(tournamentData.created)}`));
    log.line(log.format.grey(`Nb. of rounds: ${tournamentData.rounds}`));
    log.line(log.format.grey(`Nb. of players: ${tournamentData.players.length}`));

    let longestLineLength = array.max(tournamentData.races.map(r =>
        array.max(r.map(p => p.name.length + String(p.score || '').length))));

    const formatResultLine = (padLength = 0, medalIndex = {}) => (player) =>
        log.format.blue(player.name) +
        log.format.grey(''.padStart(padLength - player.name.length - String(player.score || '').length, '.')) +
        log.format.yellow(String(player.score || log.format.grey(0))) +
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

    const racesPerRound = TournamentHelper.getRaceQuantityPerRound(tournamentData);
    for (let i in tournamentData.races) {
        if (i % racesPerRound === 0) {
            log.line(`-----------\n⚡️ ROUND ${1+i/racesPerRound}${log.format.grey('/'+tournamentData.rounds)}\n-----------\n`);
        }
        log.line(`🏁 Match ${1 + Number(i)}\n` +
            tournamentData.races[i]
                .sort((a, b) => b.score - a.score)
                .map(formatResultLine(longestLineLength+1))
                .join(`\n`) + '\n');
    }
};

const readTournamentFromFile = (file, showLeaderboard = false) => {
    const tournamentData = TournamentHelper.readTournamentFile(file);
    displayTournament(tournamentData, showLeaderboard);
};

const checkExistingTournamentFile = (saveTo) => {
    if (!saveTo) return Promise.reject();
    if (!fs.existsSync(saveTo)) return Promise.resolve();

    log.line(`A tournament file ${log.format.bold(saveTo)} already exists, replace? ${log.format.grey(`(Y/n) `)}`, false);

    const promise = new Promise(function(resolve, reject) {
        const stdIn = process.stdin;
        stdIn.setEncoding('utf-8');

        stdIn.on('data', (data) => {
            if (typeof data !== 'string') return;
            const answer = data.toLowerCase().replace('\n', '');
            if (answer === 'y' || answer === '') {
                resolve();
            } else if (answer === 'n') {
                reject();
            }
        });
    });

    return promise;
};

const startSaveRaceResults = (raceNb, file) => {
    const tournamentData = TournamentHelper.readTournamentFile(file);
    if (!tournamentData.races) log.error(`Wrong file ${file}`);
    askResultsForRaceResults(tournamentData, raceNb || TournamentHelper.getLastUnfinishedRace(tournamentData), file);
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
    const actualTournamentData = TournamentHelper.readTournamentFile(file);
    actualTournamentData.races[raceNb-1] = raceData;
    tournamentData.races = actualTournamentData.races;
    const isTournamentFinished = checkForNewRound(tournamentData);
    TournamentHelper.writeTournamentFile(tournamentData, file);
    return isTournamentFinished;
};

const checkForNewRound = (tournamentData) => {
    const racesPerRound = TournamentHelper.getRaceQuantityPerRound(tournamentData);
    const roundTotal = tournamentData.rounds;

    const roundExists = roundNb => !!tournamentData.races[roundNb * racesPerRound];
    const isLastRound = roundNb => roundNb === roundTotal - 1;

    for (let roundNb = 0; roundNb < roundTotal; roundNb++) {
        let isRoundFinished = true;
        for (let raceNb = 0; raceNb < racesPerRound; raceNb++) {
            isRoundFinished = isRoundFinished && TournamentHelper.isRaceFinished(tournamentData, roundNb * racesPerRound + raceNb);
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
        startTournament({
            file: params.file || params.f || MKTM_FILE,
            players: params.players || params.p,
            lazy: params.lazy || params.l,
            rounds: params.rounds || params.r || DEFAULT_ROUND_NB,
        });
        break;
    case 'add':
        addPlayers({
            file: params.file || params.f || MKTM_FILE,
            players: params.players || params.p,
            lazy: params.lazy || params.l,
        });
        break;
    case 'status':
        readTournamentFromFile(params.file || params.f || MKTM_FILE);
        break;
    case 'results':
        const roundNb = params[ACTION_ARGS_KEY] && params[ACTION_ARGS_KEY].length && !isNaN(+params[ACTION_ARGS_KEY][0]) ?
            +params[ACTION_ARGS_KEY][0] : 0;
        startSaveRaceResults(roundNb, params.file || params.f || MKTM_FILE);
        break;
    case 'leaderboard':
        readTournamentFromFile(params.file || params.f || MKTM_FILE, true);
        break;
    default:
        log.line(`
${log.format.bold('Mario Kart Tournament Maker')}
Usage: node mktm.js <command> [options]

${log.format.bold('COMMANDS')}

  ${log.format.yellow(log.format.bold('new'))}
    Creates a new tournament.
    Options:
    ${log.format.bold('--rounds')} NUMBER, ${log.format.bold('-r')} NUMBER
            Number of rounds of the tournament. ${log.format.grey(`Default: ${DEFAULT_ROUND_NB}`)}
    ${log.format.bold('--players')} NAME1 NAME2..., ${log.format.bold('-p')} NAME1 NAME2...
            Names of the players. Without this option, you'll be prompted to provided them.
    ${log.format.bold('--lazy')} NUMBER, ${log.format.bold('-l')} NUMBER
            Creates a new game only with a number of players, default names will be attributed.
  
  ${log.format.yellow(log.format.bold('add'))}
    Add a new player to the tournament, ONLY if still on round 1.
    Options:
    ${log.format.bold('--players')} NAME1 NAME2..., ${log.format.bold('-p')} NAME1 NAME2...
            Names of the new players. Without this option, you'll be prompted to provided them.
    ${log.format.bold('--lazy')} NUMBER, ${log.format.bold('-l')} NUMBER
            Add a specific number of players, default names will be attributed.

  ${log.format.yellow(log.format.bold('status'))}
    Displays the tournament's matches status.
    
  ${log.format.yellow(log.format.bold('results'))} [MATCH_NB]
    Enters the results of a match. If no match number provided, will ask for the results of the first unfinished match.
    
  ${log.format.yellow(log.format.bold('leaderboard'))}
    Displays the leaderboard.

${log.format.bold('GLOBAL OPTIONS')}
    
    ${log.format.bold('--file')} FILE, ${log.format.bold('-f')} FILE
            Path of the tournament save file to write to / read from. ${log.format.grey(`Default: ${DEFAULT_MKTM_FILE}`)}
            Can also be provided through the env variable MKTM_FILE.

`);
}
