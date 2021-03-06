// npm modules
import ora from 'ora';
import chalk from 'chalk';
// our modules
import env from './assignConfig';
import {api, config} from '../../utils';
import handleKeypressEvents from './handleKeypressEvents';
import requestLoop from './gradingAssigner';
import createRequestBody from './createRequestBody';
import checkAssigned from './checkAssigned';
import configureAssign from './configureAssign';

const validateIds = (ids, spinner) => {
  if (ids[0] === 'all') {
    env.ids = Object.keys(config.certs);
  } else {
    const invalid = ids.filter(id => !Object.keys(config.certs).includes(id));
    if (invalid.length) {
      spinner.fail(chalk.red(`Error: You are not certified for project(s): ${[...invalid].join(', ')}`));
      process.exit(1);
    }
    env.ids = ids;
  }
};

const registerOptions = (options, spinner) => {
  if (options.push && !config.pushbulletToken) {
    spinner.fail(chalk.red('You have to set up pushbullet using the "urcli setup" command first.'));
    process.exit(1);
  }
  Object.keys(env.flags).forEach((flag) => {
    if (options[flag]) env.flags[flag] = true;
  });
};

// When the command is run we either update the submission_request or create a
// new one.
const createOrUpdateSubmissionRequest = async () => {
  try {
    let submissionRequest = await api({task: 'get'});
    env.submission_request = submissionRequest.body[0];
    if (submissionRequest.body[0]) {
      await api({
        task: 'update',
        id: env.submission_request.id,
        body: createRequestBody(),
      });
      // Since update doesn't refresh we have to call the refresh endpoint.
      submissionRequest = await api({
        task: 'refresh',
        id: env.submission_request.id,
      });
    } else {
      submissionRequest = await api({
        task: 'create',
        body: createRequestBody(),
      });
    }
    env.submission_request = submissionRequest.body;
    env.requestIds.push(env.submission_request.id);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
};

async function assignCmd(ids, options) {
  // Set the environment to the user defined configuration if it exists.
  const defaultFlagsAreDefined = !!Object.keys(config.assign.flags).length;
  env.flags = defaultFlagsAreDefined ? config.assign.flags : env.flags;
  // Check if a default command has been configured if the user doesn't
  // provide ids as arguments.
  if (!ids.length) {
    if (!config.assign.default) {
      console.log(chalk.red('You have not yet configured default projects.'));
      console.log(chalk.red('You have to provide project ids as arguments to this command.'));
      console.log(`Use ${chalk.green('urcli assign config')} to configure the assing command.`);
      process.exit(0);
    }
    /* eslint-disable no-param-reassign */
    ids = config.assign.default;
  }
  // If the user is configuring the command we exit after configuration.
  if (ids[0] === 'config') {
    await configureAssign();
    process.exit(0);
  }
  const spinner = ora('Checking command parameters..').start();
  validateIds(ids, spinner);
  registerOptions(options, spinner);
  spinner.text = 'Checking for assigned reviews..';
  await checkAssigned();
  if (env.assigned.length < 2) {
    spinner.text = 'Creating or updating submission request..';
    await createOrUpdateSubmissionRequest();
  }
  handleKeypressEvents();
  spinner.succeed('Environment ready. Starting main submission request loop.');
  requestLoop();
}

export default assignCmd;
