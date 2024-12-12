import bodyParser from 'body-parser';
import { Router, Request, Response } from 'express';
import { Chalk } from 'chalk';
import path from 'node:path';
import fs from 'node:fs';
import { exec } from 'child_process';
import simpleGit from 'simple-git';
import { promisify } from 'util';
import { PUBLIC_DIRECTORIES, PLUGIN_DIRECTORIES } from './constants';
import type { PluginInfo, Plugin } from './types/types';

const GITHUB_NAME_REGEX = /^[\w.-]+$/;
const GITHUB_USERNAME_MAX_LENGTH = 39;
const GITHUB_REPO_MAX_LENGTH = 100;

const chalk = new Chalk();
const MODULE_NAME = '[SillyTavern-Emma-Plugin]';

// List of allowed editor commands
const ALLOWED_EDITORS = ['code', 'webstorm', 'atom', 'sublime', 'notepad++'] as const;
type EditorCommand = typeof ALLOWED_EDITORS[number];

export async function init(router: Router): Promise<void> {
    const jsonParser = bodyParser.json();

    // Used to check if the server plugin is running
    router.get('/probe', routeProbe);
    router.get('/editors', routeEditorsList);
    router.post('/open', jsonParser, routeExtensionOpen);
    router.post('/create', jsonParser, routeExtensionCreate);

    function routeProbe(req: Request, res: Response) {
        const isAdmin = req.user?.profile?.admin;
        console.log(chalk.green(MODULE_NAME), `Probe request received from ${req.user?.profile?.handle} (admin: ${isAdmin})`);
        return res.sendStatus(204);
    }

    function routeEditorsList(_req: Request, res: Response) {
        return res.json(ALLOWED_EDITORS);
    }

    async function routeExtensionOpen(req: Request, res: Response) {
        try {
            if (!req.user?.profile?.admin) {
                console.warn(chalk.yellow(MODULE_NAME), `Non-admin user ${req.user?.profile?.handle} attempted to open extension`);
                return res.status(403).send('Only admins can open extensions');
            }

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
    }

    async function routeExtensionCreate(req: Request, res: Response) {
        try {
            if (!req.user?.profile?.admin) {
                console.warn(chalk.yellow(MODULE_NAME), `Non-admin user ${req.user?.profile?.handle} attempted to create extension`);
                return res.status(403).send('Only admins can create extensions');
            }

            const { name, display_name, author, email, githubUsername } = req.body;

            if (!name || !display_name || !author) {
                return res.status(400).send('Bad Request: name, display_name, and author are required in the request body.');
            }

            if (githubUsername) {
                if (!GITHUB_NAME_REGEX.test(githubUsername)) {
                    return res.status(400).send('Invalid GitHub username format. Must contain only letters, numbers, hyphens, dots, and underscores.');
                }
                if (githubUsername.length > GITHUB_USERNAME_MAX_LENGTH) {
                    return res.status(400).send(`GitHub username must not exceed ${GITHUB_USERNAME_MAX_LENGTH} characters.`);
                }
                if (!GITHUB_NAME_REGEX.test(name)) {
                    return res.status(400).send('Invalid repository name format. Must contain only letters, numbers, hyphens, dots, and underscores.');
                }
                if (name.length > GITHUB_REPO_MAX_LENGTH) {
                    return res.status(400).send(`Repository name must not exceed ${GITHUB_REPO_MAX_LENGTH} characters.`);
                }
            }

            const extensionPath = path.join(PUBLIC_DIRECTORIES.globalExtensions, name.replace(/[^a-zA-Z0-9-_]/g, ''));

            // Check if directory already exists
            if (fs.existsSync(extensionPath)) {
                console.error(chalk.red(MODULE_NAME), `Extension "${name}" already exists`);
                return res.status(409).send('Extension already exists');
            }

            // Create extension directory
            fs.mkdirSync(extensionPath);

            // Copy skeleton files
            await fs.promises.copyFile(
                path.join(PLUGIN_DIRECTORIES.skeletons, 'index.js'),
                path.join(extensionPath, 'index.js'),
            );
            await fs.promises.copyFile(
                path.join(PLUGIN_DIRECTORIES.skeletons, 'LICENSE'),
                path.join(extensionPath, 'LICENSE'),
            );

            // Read and process README template
            let readmeContent = await fs.promises.readFile(
                path.join(PLUGIN_DIRECTORIES.skeletons, 'README.md'),
                'utf8',
            );

            // Replace template variables in README
            readmeContent = readmeContent
                .replace(/username/g, githubUsername || 'your-username')
                .replace(/ExtensionName/g, name);

            await fs.promises.writeFile(
                path.join(extensionPath, 'README.md'),
                readmeContent,
            );

            // Create manifest.json
            const manifest = {
                display_name,
                version: '1.0.0',
                description: 'A new extension',
                author: email ? `${author} <${email}>` : author,
                license: 'AGPL-3.0',
                loading_order: 10,
                ...(githubUsername && {
                    homepage: `https://github.com/${githubUsername}/${name}`,
                }),
            };
            await fs.promises.writeFile(
                path.join(extensionPath, 'manifest.json'),
                JSON.stringify(manifest, null, 2),
            );

            // Initialize git repository with author info
            const git = simpleGit();
            await git.cwd(extensionPath)
                .init()
                .addConfig('user.name', author)
                .addConfig('user.email', email || `${author}@localhost`)
                .add('.')
                .commit('Initial commit');

            // re-read the manifest file to return to the client
            const manifestPath = path.join(extensionPath, 'manifest.json');
            const manifestJSON = fs.readFileSync(manifestPath, 'utf8');
            const manifestData = JSON.parse(manifestJSON);

            console.log(chalk.green(MODULE_NAME), `Created new extension "${name}" at ${extensionPath}`);
            return res.json({
                path: extensionPath,
                manifestData,
            });

        } catch (error) {
            console.error(chalk.red(MODULE_NAME), 'Failed to create extension:', error);
            return res.status(500).json({
                error: 'Failed to create extension',
                details: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

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
