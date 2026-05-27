// cli/types.ts
export type Scope = 'global' | 'project';

export interface Options {
  scope: Scope;
  force: boolean;
}

export interface InstallCommand {
  kind: 'install';
  options: Options;
}

export interface UninstallCommand {
  kind: 'uninstall';
  options: Options;
}

export interface HelpCommand {
  kind: 'help';
}

export interface VersionCommand {
  kind: 'version';
}

export interface ErrorCommand {
  kind: 'error';
  message: string;
}

export type Command =
  | InstallCommand
  | UninstallCommand
  | HelpCommand
  | VersionCommand
  | ErrorCommand;
