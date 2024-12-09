import bodyParser from 'body-parser';
import { Router } from 'express';
import { Chalk } from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PUBLIC_DIRECTORIES } from './constants';

// List of allowed editor commands
const ALLOWED_EDITORS = ['webstorm', 'code', 'open'] as const;
type EditorCommand = typeof ALLOWED_EDITORS[number];

interface PluginInfo {
    id: string;
    name: string;
    description: string;
}

interface Plugin {
    init: (router: Router) => Promise<void>;
    exit: () => Promise<void>;
    info: PluginInfo;
}

const chalk = new Chalk();
const MODULE_NAME = '[SillyTavern-ExtensionsManagerManager-Plugin]';

/**
 * Initialize the plugin.
 * @param router Express Router
 */
export async function init(router: Router): Promise<void> {
    const jsonParser = bodyParser.json();
    // Used to check if the server plugin is running
    router.get('/probe', (_req, res) => {
        return res.sendStatus(204);
    });
    // Use body-parser to parse the request body
    router.post('/ping', jsonParser, async (req, res) => {
        try {
            const { message } = req.body;
            return res.json({ message: `Pong! ${message}` });
        } catch (error) {
            console.error(chalk.red(MODULE_NAME), 'Request failed', error);
            return res.status(500).send('Internal Server Error');
        }
    });


    // Get list of allowed editors
    router.get('/editors', (_req, res) => {
        return res.json(ALLOWED_EDITORS);
    });

    router.post('/open', jsonParser, async (req, res) => {
        try {
            const { editor = 'webstorm', extensionName } = req.body;

            if (!extensionName) {
                return res.status(400).send('Extension name is required');
            }

            // Type check the editor command
            if (!ALLOWED_EDITORS.includes(editor as EditorCommand)) {
                console.error(chalk.red(MODULE_NAME), `Invalid editor command: ${editor}`);
                return res.status(400).send(`Editor must be one of: ${ALLOWED_EDITORS.join(', ')}`);
            }

            // Get list of valid global extensions
            const globalExtensions = fs
                .readdirSync(PUBLIC_DIRECTORIES.globalExtensions)
                .filter(f => fs.statSync(path.join(PUBLIC_DIRECTORIES.globalExtensions, f)).isDirectory());

            // Check if the requested extension exists
            if (!globalExtensions.includes(extensionName)) {
                console.error(chalk.red(MODULE_NAME), `Extension "${extensionName}" not found in global extensions`);
                return res.status(404).send('Extension not found');
            }

            // Construct path to index.js within the extension
            const extensionPath = path.join(PUBLIC_DIRECTORIES.globalExtensions, extensionName, 'index.js');

            // Verify the index.js file exists
            if (!fs.existsSync(extensionPath)) {
                console.error(chalk.red(MODULE_NAME), `index.js not found in extension "${extensionName}"`);
                return res.status(404).send('index.js not found in extension');
            }

            const execAsync = promisify(exec);
            console.log(chalk.green(MODULE_NAME), `Opening extension "${extensionName}" with editor "${editor}"`);
            console.debug(chalk.green(MODULE_NAME), 'Extension path:', extensionPath);
            await execAsync(`${editor} "${extensionPath}"`);
            return res.sendStatus(200);

        } catch (error) {
            console.error(chalk.red(MODULE_NAME), 'Failed to execute command:', error);
            return res.status(500).send('Internal Server Error');
        }
    });

    console.log(chalk.green(MODULE_NAME), 'Plugin loaded!');
}

export async function exit(): Promise<void> {
    console.log(chalk.yellow(MODULE_NAME), 'Plugin exited');
}

export const info: PluginInfo = {
    id: 'emm',
    name: 'Extensions Manager Manager Plugin',
    description: 'A simple example plugin for SillyTavern server.',
};

const plugin: Plugin = {
    init,
    exit,
    info,
};

export default plugin;
