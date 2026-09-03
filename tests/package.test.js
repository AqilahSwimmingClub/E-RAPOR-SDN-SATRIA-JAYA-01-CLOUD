import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { APP_VERSION, VERSION_CODE } from '../src/data/version.js';

const root=new URL('../',import.meta.url);
function read(path){return readFileSync(new URL(path,root),'utf8');}
function exists(path){return existsSync(new URL(path,root));}

test('Capacitor config uses one web build for the requested app identity',()=>{
  const config=JSON.parse(read('capacitor.config.json'));
  /* appName menjadi label peluncur Android. Produk dipakai banyak sekolah, jadi labelnya
     adalah nama produk; appId di bawahnya tetap dikunci demi pembaruan instalasi lama. */
  assert.equal(config.appName,'e-Rapor');
  assert.equal(config.appId,'id.sch.sdn.satriajaya01.erapor');
  assert.equal(config.webDir,'dist');
  assert.equal(config.server.cleartext,false);
  const scripts=JSON.parse(read('package.json')).scripts;
  assert.match(scripts.build,/build-web/);assert.match(scripts['cap:android'],/cap sync android/);assert.match(scripts['cap:ios'],/cap sync ios/);
});

test('Android project is build-ready with app ID, web assets, icon, splash, and safe system bars',()=>{
  const gradle=read('android/app/build.gradle'),manifest=read('android/app/src/main/AndroidManifest.xml'),styles=read('android/app/src/main/res/values/styles.xml');
  assert.match(gradle,/applicationId "id\.sch\.sdn\.satriajaya01\.erapor"/);
  assert.match(manifest,/@mipmap\/ic_launcher/);assert.match(manifest,/@style\/AppTheme\.NoActionBarLaunch/);
  assert.match(styles,/windowSplashScreenAnimatedIcon/);assert.match(styles,/android:statusBarColor/);assert.match(styles,/android:navigationBarColor/);
  assert.equal(exists('android/app/src/main/assets/public/index.html'),true);
  assert.equal(exists('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'),true);
  assert.equal(exists('android/app/src/main/res/drawable/splash.png'),true);
});

test('Android release uses stable identity, production versioning, and external signing credentials',()=>{
  const gradle=read('android/app/build.gradle'),ignore=read('.gitignore'),example=read('android/signing.properties.example');
  assert.match(gradle,/applicationId "id\.sch\.sdn\.satriajaya01\.erapor"/);
  /* Default gradle wajib mengikuti src/data/version.js supaya versionCode APK tidak pernah
     tertinggal dari rilis dan APK baru selalu bisa menimpa instalasi lama. */
  assert.match(gradle,new RegExp(`ERAPOR_VERSION_CODE'\\) \\?: '${VERSION_CODE}'`));
  assert.match(gradle,new RegExp(`ERAPOR_VERSION_NAME'\\) \\?: '${APP_VERSION.replace(/\./g,'\\.')}'`));
  assert.match(gradle,/signingConfig signingConfigs\.release/);assert.doesNotMatch(gradle,/signingConfig signingConfigs\.debug/);
  assert.match(gradle,/Release signing belum dikonfigurasi/);assert.match(ignore,/^signing\.properties$/m);assert.match(ignore,/^\*\.jks$/m);
  assert.match(example,/storePassword=ISI_DARI_PASSWORD_MANAGER/);assert.doesNotMatch(example,/storePassword=(?!ISI_DARI_)/);
});

test('app startup migrates data before reading session and About displays all version fields',()=>{
  const app=read('src/app.js'),settings=read('src/pages/settings.js');
  assert.ok(app.indexOf('runAppMigrations()')<app.indexOf('getSession()'));
  assert.match(app,/Data lama sudah dipulihkan dari snapshot otomatis/);
  assert.match(settings,/Tentang Aplikasi/);assert.match(settings,/versionCode/);assert.match(settings,/schemaVersion/);
});

test('iOS project is available with app ID, iOS 15 target, icon, splash, and web assets',()=>{
  const project=read('ios/App/App.xcodeproj/project.pbxproj'),info=read('ios/App/App/Info.plist'),swiftPackage=read('ios/App/CapApp-SPM/Package.swift');
  assert.match(project,/PRODUCT_BUNDLE_IDENTIFIER = id\.sch\.sdn\.satriajaya01\.erapor/);
  assert.match(project,/IPHONEOS_DEPLOYMENT_TARGET = 15\.0/);assert.match(info,/e-Rapor SDN Satria Jaya 01/);
  assert.match(swiftPackage,/capacitor-swift-pm/);assert.equal(exists('ios/App/App/public/index.html'),true);
  assert.equal(exists('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'),true);
  assert.equal(exists('ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany.png'),true);
});

test('Final responsive CSS contains native safe-area and bounded modal protections',()=>{
  const css=read('src/styles/app.css');
  assert.match(css,/env\(safe-area-inset-top\)/);assert.match(css,/100dvh/);
  assert.match(css,/max-height:calc\(100dvh/);assert.match(css,/overflow-x:hidden/);assert.match(css,/@media\(max-width:767px\)/);
});
