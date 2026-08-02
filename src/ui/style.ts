import { ux } from '@oclif/core';

/**
 * The colours this plugin paints with, a deliberate subset of oclif's standard ANSI names:
 * each one is a terminal default that the user's own theme redefines, so the output follows
 * the terminal instead of imposing a palette on it.
 */
type Colour = 'green' | 'yellow' | 'red' | 'gray';

/** The markers formatDiff writes, which are what carries the meaning of a line. */
type Marker = '+' | '~' | '-' | '=';

/** The level a finding line opens with. */
type Level = 'error' | 'warning';

const markerColours: Record<Marker, Colour> = {
    '+': 'green',
    '~': 'yellow',
    '-': 'red',
    '=': 'gray',
};

const levelColours: Record<Level, Colour> = {
    error: 'red',
    warning: 'yellow',
};

function isMarker(char: string): char is Marker {
    return char in markerColours;
}

function isLevel(word: string): word is Level {
    return word in levelColours;
}

/**
 * Colour a diff body by its markers, leaving the kind and target headings plain so the shape
 * of the plan still reads in a terminal with no colour at all.
 *
 * Matching on the marker is what keeps the colour out of `core`, where a CLI concern like a
 * terminal's capabilities may not go: the marker is already the contract that formatDiff and
 * its tests agree on, so nothing new has to be threaded through the pure layer.
 */
export function colourDiff(lines: string[]): string[] {
    return lines.map((line) => {
        const marker = line.trimStart().charAt(0);

        if (!isMarker(marker)) {
            return line;
        }

        return ux.colorize(markerColours[marker], line);
    });
}

/**
 * Colour the `error:`/`warning:` label a finding opens with, and nothing else, so the message
 * beside it keeps the terminal's own foreground and stays readable on any theme.
 */
export function colourFindings(lines: string[]): string[] {
    return lines.map((line) => colourFinding(line));
}

function colourFinding(line: string): string {
    const separator = line.indexOf(':');
    const level = line.slice(0, separator);

    if (separator < 0 || !isLevel(level)) {
        return line;
    }

    const label = ux.colorize(levelColours[level], `${level}:`);

    return `${label}${line.slice(separator + 1)}`;
}
