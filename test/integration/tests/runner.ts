import fs from 'fs';
import path from 'path';

import Mocha from 'mocha';


class PytestReporter extends Mocha.reporters.Base {
  constructor(runner: Mocha.Runner) {
    super(runner);

    runner.once('start', () => {
      const tests: object[] = [];

      runner.suite.eachTest((test: Mocha.Test) => {
        tests.push(this.expressTest(test));
      });

      this.writeEvent('collect', {tests});
      this.waitForAck();
    });

    runner.on('test', (test: Mocha.Test) => {
      this.writeEvent('test', this.expressTest(test));
    });

    runner.on('fail', (test: Mocha.Test, err) => {
      this.writeEvent('fail', {
        ...this.expressTest(test),
        err: err.message,
        stack: err.stack || null
      });
    });

    runner.on('pass', (test: Mocha.Test) => {
      this.writeEvent('fail', this.expressTest(test));
    });

    runner.once('end', () => {
      this.writeEvent('end');
    });
  }

  public expressTest(test: Mocha.Test): object {
    return {
      title: test.title,
      parents: test.titlePath(),
      file: test.file,
      state: test.state,
    }
  }

  protected writeEvent(type: string, event: object = {}) {
    const line = {
      type,
      ...event,
    };

    const buffer = JSON.stringify(line);
    process.stdout.write(buffer);
    process.stdout.write('\n');
  }

  /**
   * Wait for the pytest process to give an acknowledgment over stdin
   */
  protected waitForAck() {
    fs.readSync(0, Buffer.alloc(1), 0, 1, null);
  }
}


class PytestMocha extends Mocha {
  public loadFiles() {
    super.loadFiles();
  }
}


const mocha = new PytestMocha({
  reporter: PytestReporter,

  // A really long timeout allows us to set breakpoints without fear of Mocha
  // aborting our test.
  timeout: 300000,
});


mocha.addFile(path.join(__dirname, 'test.ts'));
mocha.loadFiles();
mocha.run();
