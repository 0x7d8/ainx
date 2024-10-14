@extends('layouts.admin')
<?php 
    // Define extension information.
    $EXTENSION_ID = "{identifier}";
    $EXTENSION_NAME = "{name}";
    $EXTENSION_VERSION = "{version}";
    $EXTENSION_DESCRIPTION = "__description__";
    $EXTENSION_ICON = "__icon__";
?>
@include('blueprint.admin.template')

@section('title')
	{{ $EXTENSION_NAME }}
@endsection

@section('content-header')
	@yield('extension.header')
@endsection

@section('content')
@yield('extension.config')
@yield('extension.description')
__content__
@endsection
