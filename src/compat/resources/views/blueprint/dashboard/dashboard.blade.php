@section("blueprint.lib")
  <?php
    use Pterodactyl\BlueprintFramework\Libraries\ExtensionLibrary\Client\BlueprintClientLibrary as BlueprintExtensionLibrary;

    $settings = app()->make('Pterodactyl\Contracts\Repository\SettingsRepositoryInterface');
    $blueprint = app()->make(BlueprintExtensionLibrary::class, ['settings' => $settings]);
  ?>
@endsection

@section("blueprint.wrappers")
	@foreach (File::allFiles(base_path('resources/views/blueprint/dashboard/wrappers')) as $partial)
    @if ($partial->getExtension() == 'php')
			@include('blueprint.dashboard.wrappers.'.str_replace('.blade.php','',basename($partial->getPathname())))
		@endif
  @endforeach
@endsection