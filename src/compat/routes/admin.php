<?php

use Illuminate\Support\Facades\Route;
use Pterodactyl\Http\Controllers\Admin;

Route::group(['prefix' => 'extensions/__identifier__'], function () {
	Route::get('/', [Admin\Extensions\__identifier__\__identifier__ExtensionController::class, 'index'])->name('admin.extensions.__identifier__.index');
	Route::patch('/', [Admin\Extensions\__identifier__\__identifier__ExtensionController::class, 'update'])->name('admin.extensions.__identifier__.patch');
	Route::post('/', [Admin\Extensions\__identifier__\__identifier__ExtensionController::class, 'post'])->name('admin.extensions.__identifier__.post');
	Route::put('/', [Admin\Extensions\__identifier__\__identifier__ExtensionController::class, 'put'])->name('admin.extensions.__identifier__.put');
	Route::delete('/{target}/{id}', [Admin\Extensions\__identifier__\__identifier__ExtensionController::class, 'delete'])->name('admin.extensions.__identifier__.delete');
});