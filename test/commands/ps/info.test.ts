import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import Info from '../../../src/commands/ps/info.js';

describe('ps info', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;

  beforeEach(() => {
    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
  });

  afterEach(() => {
    $$.restore();
  });

  it('runs ps info', async () => {
    await Info.run([]);
    const output = sfCommandStubs.log
      .getCalls()
      .flatMap((c) => c.args)
      .join('\n');
    expect(output).to.include('sf-plugin-permission-sets');
  });

  it('returns the plugin name', async () => {
    const result = await Info.run([]);
    expect(result.name).to.equal('sf-plugin-permission-sets');
  });
});
