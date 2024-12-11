import bodyParser from 'body-parser';
import { Router } from 'express';
import { Chalk } from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'child_process';
import simpleGit from 'simple-git';
import { promisify } from 'util';
import { PUBLIC_DIRECTORIES } from './constants';

// List of allowed editor commands
const ALLOWED_EDITORS = ['code', 'webstorm', 'atom', 'sublime', 'notepad++'] as const;
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
const MODULE_NAME = '[SillyTavern-Emma-Plugin]';

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
        // here I would check if the user is allowed to create extensions
        // but TypeScript doesn't allow me to access the user object from the request
        // so I guess the user is allowed to create extensions

        try {
            const { name, display_name, author, email } = req.body;

            if (!name || !display_name || !author) {
                return res.status(400).send('Bad Request: name, display_name, and author are required in the request body.');
            }

            const extensionPath = path.join(PUBLIC_DIRECTORIES.globalExtensions, name.replace(/[^a-zA-Z0-9-_]/g, ''));

            // Check if directory already exists
            if (fs.existsSync(extensionPath)) {
                console.error(chalk.red(MODULE_NAME), `Extension "${name}" already exists`);
                return res.status(409).send('Extension already exists');
            }

            // Create extension directory
            fs.mkdirSync(extensionPath);

            // Create manifest.json
            const manifest = {
                display_name,
                version: '1.0.0',
                description: 'A new extension',
                author: email ? `${author} <${email}>` : author,
                license: 'MIT',
                loading_order: 10,
            };
            fs.writeFileSync(
                path.join(extensionPath, 'manifest.json'),
                JSON.stringify(manifest, null, 2),
            );

            // Create index.js
            const indexContent = '// Extension code goes here\n';
            fs.writeFileSync(path.join(extensionPath, 'index.js'), indexContent);

            // Initialize git repository with author info
            const git = simpleGit();
            await git.cwd(extensionPath)
                .init()
                .addConfig('user.name', author)
                .addConfig('user.email', email || `${author}@localhost`)
                .add('.')
                .commit('Initial commit');

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
    id: 'emma',
    name: 'Emma Plugin',
    description: 'Helper plugin for Emma',
};

const plugin: Plugin = {
    init,
    exit,
    info,
};

export default plugin;
