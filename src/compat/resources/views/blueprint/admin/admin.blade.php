@section("blueprint.lib")
  <?php
    use Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Admin\BlueprintAdminLibrary as BlueprintExtensionLibrary;

    $settings = app()->make('Pterodactyl\Contracts\Repository\SettingsRepositoryInterface');
    $blueprint = app()->make(BlueprintExtensionLibrary::class, ['settings' => $settings]);
  ?>
@endsection

@section("blueprint.import")
  {!! $blueprint->importStylesheet('https://unpkg.com/boxicons@latest/css/boxicons.min.css') !!}
  {!! $blueprint->importStylesheet('https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css') !!}
	{!! $blueprint->importStylesheet('/assets/blueprint.style.css') !!}
@endsection

@section("blueprint.notifications")
  <?php
    $notification = $blueprint->dbGet("blueprint", "notification:text");
    if($notification != null) {
      echo "<div class=\"notification\">
      <p>".$notification."</p>
      </div>
      ";

      $blueprint->dbSet("blueprint", "notification:text", "");
    }
  ?>
@endsection

@section("blueprint.wrappers")
  @foreach (File::allFiles(base_path('resources/views/blueprint/admin/wrappers')) as $partial)
    @if ($partial->getExtension() == 'php')
			@include('blueprint.admin.wrappers.'.str_replace('.blade.php','',basename($partial->getPathname())))
    @endif
  @endforeach
@endsection