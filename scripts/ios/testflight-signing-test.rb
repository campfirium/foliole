# frozen_string_literal: true

require 'fastlane'
require 'sigh'
require 'tmpdir'
require 'fileutils'
require 'yaml'
require 'open3'

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
  unless config[:output_path] == File.dirname(ENV.fetch('FOLIOLE_IOS_SIGNING_PROFILES'))
    raise 'Downloaded profiles must stay with the distribution artifacts'
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

workflow = YAML.safe_load(File.read(File.expand_path('../../.github/workflows/release-ios.yml', __dir__)), aliases: true)
install = workflow.fetch('jobs').fetch('signed-upload').fetch('steps').find do |step|
  step['name'] == 'Install iPhone distribution credentials in a temporary keychain'
end
Dir.mktmpdir('testflight-credential-contract-', root) do |directory|
  trace = File.join(directory, 'security.log')
  security = File.join(directory, 'security')
  File.write(security, <<~'SH')
    #!/bin/sh
    printf '%s\n' "$*" >> "$FOLIOLE_TEST_SECURITY_TRACE"
    if [ "$1" = '-h' ]; then echo 'set-key-partition-list'; fi
    if [ "$1" = 'find-identity' ]; then
      echo '1) AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA "Apple Distribution: Test"'
    fi
  SH
  File.write(File.join(directory, 'codesign'), "#!/bin/sh\nexit 0\n")
  FileUtils.chmod(0o755, [security, File.join(directory, 'codesign')])
  env = { 'PATH' => "#{directory}:#{ENV.fetch('PATH')}", 'RUNNER_TEMP' => directory,
          'FOLIOLE_TEST_SECURITY_TRACE' => trace, 'GITHUB_ENV' => File.join(directory, 'env'),
          'APPLE_API_ISSUER' => 'test', 'APPLE_API_KEY_ID' => 'test',
          'APPLE_API_KEY_BASE64' => 'dGVzdA==',
          'IOS_DISTRIBUTION_CERTIFICATE_BASE64' => 'dGVzdA==',
          'IOS_DISTRIBUTION_CERTIFICATE_PASSWORD' => 'test' }
  output, status = Open3.capture2e(env, 'bash', '-e', '-c', install.fetch('run'))
  raise "Credential installation contract failed: #{output}" unless status.success?
  calls = File.read(trace)
  unless calls.lines.any? { |line| line.start_with?('import ') && line.include?('-T /usr/bin/codesign') }
    raise 'The imported private key must authorize the codesign application without prompting'
  end
  unless calls.lines.any? { |line| line.start_with?('set-key-partition-list ') && line.include?('codesign:') && line.include?(' -s ') }
    raise 'The signing key must receive the noninteractive codesign partition'
  end
end
puts 'Validated noninteractive credential installation through the production workflow.'
