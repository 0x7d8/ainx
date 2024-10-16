<?php

/**
 * BlueprintExtensionLibrary (Console variation)
 *
 * @category   BlueprintExtensionLibrary
 * @package    BlueprintConsoleLibrary
 * @author     Emma <hello@prpl.wtf>
 * @copyright  2023-2024 Emma (prpl.wtf)
 * @license    https://blueprint.zip/docs/?page=about/License MIT License
 * @link       https://blueprint.zip/docs/?page=documentation/$blueprint
 * @since      alpha
 */

namespace Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Console;

use Pterodactyl\Contracts\Repository\SettingsRepositoryInterface;

class BlueprintConsoleLibrary
{
  public function __construct(
    private SettingsRepositoryInterface $settings,
  ) {
  }

  public function dbGet($table, $record, $default = null) {
    $value = $this->settings->get($table."::".$record);
    if($value) {
      return $value;
    } else {
      return $default;
    }
  }

  public function dbSet($table, $record, $value) {
    return $this->settings->set($table."::".$record, $value);
  }

  public function dbForget($table, $record) {
    return $this->settings->forget($table."::".$record);
  }

  public function fileRead($path) {
    if (!file_exists($path)) {
      return "File not found: " . $path;
    }
    if (!is_readable($path)) {
      return "File is not readable: " . $path;
    }

    return file_get_contents($path);
  }

  public function fileMake($path) {
    $file = fopen($path, "w");
    fclose($file);
  }

  public function fileWipe($path) {
    if(is_dir($path)) {
      $files = array_diff(scandir($path), ['.', '..']);
      foreach ($files as $file) {
        $this->fileWipe($path . DIRECTORY_SEPARATOR . $file);
      }
      rmdir($path);
    } elseif (is_file($path)) {
      unlink($path);
    }
  }

  public function extension($identifier) {
    if(file_exists(".blueprint/extensions/$identifier")) {
      return true;
    } else {
      return false;
    }
  }

  public function extensionList() {
    $extensions = [];
    $files = scandir(".blueprint/extensions");
    foreach($files as $file) {
      if($file != "." && $file != "..") {
        $extensions[] = $file;
      }
    }

    return $extensions;
  }
}
