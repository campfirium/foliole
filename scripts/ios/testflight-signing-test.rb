# frozen_string_literal: true

require 'fastlane'
require 'sigh'
require 'tmpdir'
require 'fileutils'

def opt_out_usage; end
def default_platform(*); end
def platform(*); yield; end
def desc(*); end
def lane(name, &block); (@lanes ||= {})[name] = block; end

def get_provisioning_profile(**options)
  config = FastlaneCore::Configuration.create(Sigh::Options.available_options, options)
  unless config[:platform] == 'ios' && config[:development] == false && config[:adhoc] == false &&
         config[:force] == false && config[:skip_certificate_verification] == false
    raise 'Signing must use verified installed distribution credentials and App Store profiles'
  end
  options.fetch(:app_identifier)
end

load File.expand_path('fastlane/Fastfile', __dir__)
def apple_api_key; {}; end

root = File.expand_path('../../.tmp/artifacts', __dir__)
FileUtils.mkdir_p(root)
Dir.mktmpdir('testflight-signing-', root) do |directory|
  ENV['FOLIOLE_IOS_SIGNING_PROFILES'] = File.join(directory, 'profiles.json')
  @lanes.fetch(:prepare_signing).call
  profiles = JSON.parse(File.read(ENV.fetch('FOLIOLE_IOS_SIGNING_PROFILES')))
  expected = { 'App' => 'com.campfirium.foliole.ios',
               'FolioleShareExtension' => 'com.campfirium.foliole.ios.share' }
  raise 'Both distribution targets must receive their own profile' unless profiles == expected
end
puts 'Validated App Store signing options for app and extension.'
