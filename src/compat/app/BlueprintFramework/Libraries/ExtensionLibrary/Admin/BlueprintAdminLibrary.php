<?php

// Core file for the admin-side library for Blueprint Extensions


namespace Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Admin;

use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

class BlueprintAdminLibrary
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

  public function notify($text): void {
    $this->dbSet("blueprint", "notification:text", $text);
    return;
  }

  public function notifyAfter($delay, $text): void {
    $this->dbSet("blueprint", "notification:text", $text);
    header("Refresh:$delay");
    return;
  }

  public function notifyNow($text): void {
    $this->dbSet("blueprint", "notification:text", $text);
    header("Refresh:0");
    return;
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

  public function extensionList(): array {
    $extensions = [];
    $files = scandir(".blueprint/extensions");
    foreach($files as $file) {
      if($file != "." && $file != "..") {
        if(file_exists(".blueprint/extensions/$file/$file.ainx")) {
          $extensions[] = $file;
        }
      }
    }

    return $extensions;
  }

  public function importStylesheet($url): string {
    $cache = $this->dbGet("blueprint", "cache");
    return "<link rel=\"stylesheet\" href=\"$url?v=$cache\">";
  }

  public function importScript($url): string {
    $cache = $this->dbGet("blueprint", "cache");
    return "<script src=\"$url?v=$cache\"></script>";
  }
}
