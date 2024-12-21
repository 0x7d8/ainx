<?php

/**
 * BlueprintExtensionLibrary (Base code, do not use directly)
 *
 * @category   BlueprintExtensionLibrary
 * @package    BlueprintBaseLibrary
 * @author     Emma <hello@prpl.wtf>
 * @copyright  2023-2024 Emma (prpl.wtf)
 * @license    https://blueprint.zip/docs/?page=about/License MIT License
 * @link       https://blueprint.zip/docs/?page=documentation/$blueprint
 * @since      alpha
 */

namespace Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Collection;
use Symfony\Component\Yaml\Yaml;

class BlueprintBaseLibrary
{
  private function getRecordName(string $table, string $record) {
    return "$table::$record";
  }

  public function dbGet(string $table, string $record, mixed $default = null): mixed
  {
    $value = DB::table('settings')->where('key', $this->getRecordName($table, $record))->first();

    if (!$value) return $default;

    try {
      return unserialize($value->value);
    } catch (\Exception $e) {
      return $value->value;
    }
  }

  public function dbGetMany(string $table, array $records = [], mixed $default = null): array
  {
    if (empty($records)) {
      $values = DB::table('settings')->where('key', 'like', "$table::%")->get();
    } else {
      $values = DB::table('settings')->whereIn('key', array_map(fn($record) => $this->getRecordName($table, $record), $records))->get();
    }

    if (empty($records)) {
      $records = $values->map(fn($value) => substr($value->key, strlen($table) + 2))->toArray();
    }

    $output = [];
    foreach ($records as $record) {
      $value = $values->firstWhere('key', $this->getRecordName($table, $record));

      if (!$value) {
        $output[$record] = $default;
        continue;
      }

      try {
        $output[$record] = unserialize($value->value);
      } catch (\Exception $e) {
        $output[$record] = $value->value;
      }
    }

    return $output;
  }

  public function dbSet(string $table, string $record, mixed $value): void
  {
    DB::table('settings')->updateOrInsert(
      ['key' => $this->getRecordName($table, $record)],
      ['value' => serialize($value)]
    );
  }

  public function dbSetMany(string $table, array $records): void
  {
    $data = [];
    foreach ($records as $record => $value) {
      $data[] = [
        'key' => $this->getRecordName($table, $record),
        'value' => serialize($value),
      ];
    }

    DB::table('settings')->upsert($data, ['key'], ['value']);
  }

  public function dbForget(string $table, string $record): bool {
    return (bool) DB::table('settings')->where('key', $this->getRecordName($table, $record))->delete();
  }

  public function dbForgetMany(string $table, array $records): bool {
    return (bool) DB::table('settings')->whereIn('key', array_map(fn($record) => $this->getRecordName($table, $record), $records))->delete();
  }

  public function fileRead(string $path): string {
    if (!file_exists($path)) return '';
    if (!is_readable($path)) return '';

    return file_get_contents($path);
  }

  public function fileMake(string $path): void {
    $file = fopen($path, 'w');
    fclose($file);
  }

  public function fileWipe(string $path): bool {
    if (is_dir($path)) {
      $files = array_diff(scandir($path), ['.', '..']);

      foreach ($files as $file) {
        $this->fileWipe($path . DIRECTORY_SEPARATOR . $file);
      }

      rmdir($path);

      return true;
    } elseif (is_file($path)) {
      unlink($path);

      return true;
    } else {
      return false;
    }
  }

  public function extension(string $identifier): bool {
    return file_exists(base_path(".blueprint/extensions/$identifier"));
  }

  public function extensions(): Collection
  {
    $array = scandir(base_path('.blueprint/extensions'));
    $collection = new Collection();

    foreach ($array as $extension) {
      if (!$extension || $extension === '.' || $extension === '..') continue;

      try {
        $conf = Yaml::parse($this->fileRead(base_path(".blueprint/extensions/$extension/private/.store/conf.yml")));

        $collection->push(array_filter($conf['info'], fn($v) => (bool) $v));
      } catch (\Throwable $e) {
      }
    }

    return $collection;
  }
}
