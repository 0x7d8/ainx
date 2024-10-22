<?php

namespace Pterodactyl\Console\Commands\BlueprintFramework\Extensions\__identifier__;

use Illuminate\Console\Command;
use Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Console\BlueprintConsoleLibrary as BlueprintExtensionLibrary;

class __random__Command extends Command
{
  protected $signature = '__identifier__:__signature__';
  protected $description = '__description__';

  public function __construct(
    private BlueprintExtensionLibrary $blueprint,
  ) { parent::__construct(); }

  public function handle()
  {
    $blueprint = $this->blueprint;
    require base_path('/.blueprint/extensions/__identifier__/console/functions/__file__');
  }
}
