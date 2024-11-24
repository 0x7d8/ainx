@extends('layouts.admin')
<?php 
    $EXTENSION_ID = "__identifier__";
    $EXTENSION_NAME = "__name__";
    $EXTENSION_VERSION = "__version__";
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
