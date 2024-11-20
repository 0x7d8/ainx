<?php

/**
 * BlueprintExtensionLibrary (Client variation)
 *
 * @category   BlueprintExtensionLibrary
 * @package    BlueprintClientLibrary
 * @author     Emma <hello@prpl.wtf>
 * @copyright  2023-2024 Emma (prpl.wtf)
 * @license    https://blueprint.zip/docs/?page=about/License MIT License
 * @link       https://blueprint.zip/docs/?page=documentation/$blueprint
 * @since      alpha
 */

namespace Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Client;

use Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\BlueprintBaseLibrary;

class BlueprintClientLibrary extends BlueprintBaseLibrary
{
  public function importStylesheet(string $url): string {
    $cache = $this->dbGet('blueprint', 'cache', 0);

    return "<link rel=\"stylesheet\" href=\"$url?v=$cache\">";
  }

  public function importScript(string $url): string {
    $cache = $this->dbGet('blueprint', 'cache', 0);

    return "<script src=\"$url?v=$cache\"></script>";
  }
}
