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
            // Return the error message to the client
            const errorDetails = error instanceof Error
                ? error.message
                : (error as { stderr?: string })?.stderr || 'Unknown error';

            return res.status(500).json({
                error: 'Failed to execute command',
                details: errorDetails,
            });
        }
    });

    router.post('/create', jsonParser, async (req, res) => {
        try {
            const { name } = req.body;

            if (!name) {
                return res.status(400).send('Bad Request: name is required in the request body.');
            }

            const extensionPath = path.join(PUBLIC_DIRECTORIES.globalExtensions, name.replace(/[^a-zA-Z0-9-_]/g, ''));

            // Check if directory already exists
            if (fs.existsSync(extensionPath)) {
                console.error(chalk.red(MODULE_NAME), `Extension "${name}" already exists`);
                return res.status(409).send('Extension already exists');
            }

            // Create extension directory
            fs.mkdirSync(extensionPath, { recursive: true });

            // Create manifest.json
            const manifest = {
                name: name,
                version: '1.0.0',
                description: 'A new extension',
                author: '',
                license: 'MIT',
            };
            fs.writeFileSync(
                path.join(extensionPath, 'manifest.json'),
                JSON.stringify(manifest, null, 2),
            );

            // Create index.js
            const indexContent = '// Extension code goes here\n';
            fs.writeFileSync(path.join(extensionPath, 'index.js'), indexContent);

            console.log(chalk.green(MODULE_NAME), `Created new extension "${name}" at ${extensionPath}`);
            return res.json({
                path: extensionPath,
                manifest,
            });

        } catch (error) {
            console.error(chalk.red(MODULE_NAME), 'Failed to create extension:', error);
            return res.status(500).json({
                error: 'Failed to create extension',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
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
