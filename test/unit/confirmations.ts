import type { ConfirmDeletions } from '../../lib/services/index.js';

/**
 * The confirmation port, answering the same way every time and recording what it was asked.
 *
 * No parameter property: node runs these files by stripping types, which cannot emit the
 * assignment one implies.
 */
export class Confirmations {
    public readonly calls: number[] = [];

    private readonly answer: boolean;

    public readonly ask: ConfirmDeletions = (count) => {
        this.calls.push(count);

        return Promise.resolve(this.answer);
    };

    public constructor(answer: boolean) {
        this.answer = answer;
    }
}
