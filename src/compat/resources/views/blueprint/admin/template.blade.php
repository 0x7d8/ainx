@section("extension.header")
  <img src="{{ $EXTENSION_ICON }}" alt="{{ $EXTENSION_ID }}" style="float:left;width:30px;height:30px;border-radius:3px;margin-right:5px;"/>

  <h1 ext-title>{{ $EXTENSION_NAME }}<tag mg-left blue>{{ $EXTENSION_VERSION }}</tag></h1>
@endsection

@section("extension.description")
  <p class="ext-description">{{ $EXTENSION_DESCRIPTION }}</p>
@endsection