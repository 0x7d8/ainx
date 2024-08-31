# ainx - Pterodactyl Addon Installer

ainx is a command-line tool used to install pterodactyl addons, usually developed
using blueprint and meant to be bundled for standalone installations.

## Developing

To Develop on this tool, you need to install all required dependencies

```bash
git clone https://github.com/0x7d8/ainx.git

cd ainx

# make sure to have nodejs installed already
npm i -g pnpm
pnpm i
pnpm install:dev

# ainx is now globally available
ainx
```

## Blueprint Compatibility

```yaml
[x] PHP Routes
  [x] Client
  [x] Application
  [x] Web
[x] Database Migrations
[x] Upgrades
[x] Scripts
  [x] Install
  [x] Remove
  [ ] Export
[ ] Wrappers
[x] Placeholders v2
[ ] Flags
  [x] ignorePlaceholders
  [ ] forceLegacyPlaceholders
  [x] hasInstallScript
  [x] hasRemoveScript
  [ ] hasExportScript
[ ] $blueprint
[ ] Artisan Console
[ ] Admin views
```
