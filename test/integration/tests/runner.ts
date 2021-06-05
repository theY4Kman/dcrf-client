import fs from 'fs';
import path from 'path';

import Mocha from 'mocha';


const STDIN_FD = 0;
const STDOUT_FD = 1;


class PytestReporter extends Mocha.reporters.Base {
  constructor(runner: Mocha.Runner) {
    super(runner);

    /**
     * There is no event fired once all after/afterEach hooks have been run.
     * To workaround this, we record the test which has just ended (that is,
     * whose test function has completed), and when the next test starts or the
     * entire suite completes (whichever comes first), we interpret that as all
     * afterEach hooks having been run for the recorded test.
     */
    let pendingCompletionTest: Mocha.Test | null = null;

    const processPendingCompletionTest = () => {
      if (pendingCompletionTest != null) {
        this.writeEvent('test end', this.expressTest(pendingCompletionTest));
        pendingCompletionTest = null;
      }
    }

    runner.once('start', () => {
      const tests: object[] = [];

      runner.suite.eachTest((test: Mocha.Test) => {
        tests.push(this.expressTest(test));
      });

      this.writeEvent('collect', {tests});
      this.waitForAck();
    });

    runner.on('test', (test: Mocha.Test) => {
      processPendingCompletionTest();
      this.writeEvent('test', this.expressTest(test));
    });

    runner.on('test end', (test: Mocha.Test) => {
      pendingCompletionTest = test;
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
      processPendingCompletionTest();
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

    let buffer = JSON.stringify(line);
    do {
      let bytesWritten: number;
      try {
        bytesWritten = fs.writeSync(STDOUT_FD, buffer);
      } catch (e) {
        if (e.code === 'EAGAIN') {
          continue;
        } else {
          throw e;
        }
      }

      buffer = buffer.substr(bytesWritten);
    } while (buffer);
    fs.writeSync(STDOUT_FD, '\n');
  }

  /**
   * Wait for the pytest process to give an acknowledgment over stdin
   */
  protected waitForAck() {
    fs.readSync(STDIN_FD, Buffer.alloc(1), 0, 1, null);
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
