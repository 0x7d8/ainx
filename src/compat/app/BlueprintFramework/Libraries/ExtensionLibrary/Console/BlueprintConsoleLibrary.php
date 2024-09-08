<?php

// Core file for the console library for Blueprint Extensions


namespace Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Console;

use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

class BlueprintConsoleLibrary
{
  public function __construct(
    private SettingsRepositoryInterface $settings,
  ) {
  }

  public function dbGet($table, $record): mixed {
    return $this->settings->get($table."::".$record);
  }

  public function dbSet($table, $record, $value) {
    return $this->settings->set($table."::".$record, $value);
  }

  public function dbForget($table, $record) {
    return $this->settings->forget($table."::".$record);
  }

  public function fileRead($path) {
    return shell_exec("cat ".escapeshellarg($path).";");
  }

  public function fileMake($path) {
    $file = fopen($path, "w");
    fclose($file);
  }

  public function fileWipe($path) {
    return shell_exec("yes | rm -r ".escapeshellarg($path).";");
  }

  public function extension($identifier): bool {
    if(file_exists(".blueprint/extensions/$identifier/$identifier.ainx")) {
      return true;
    } else {
      return false;
    }
  }
}
