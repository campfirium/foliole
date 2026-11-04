# frozen_string_literal: true

require 'json'

module FolioleTestflight
  APP_ID = '6818704122'
  GROUP_ID = 'dffdd27d-de26-44fb-a864-72fd2c7b5ef7'
  ACCEPTED = %w[WAITING_FOR_BETA_REVIEW IN_BETA_REVIEW BETA_APPROVED READY_FOR_BETA_TESTING IN_BETA_TESTING].freeze
  TERMINAL_FAILURE = %w[PROCESSING_EXCEPTION EXPIRED BETA_REJECTED NOT_APPLICABLE].freeze

  def self.verify_candidate(candidate)
    raise 'Invalid candidate schema' unless candidate['schemaVersion'] == 1
    unless candidate['ipaSha256'].is_a?(String) && candidate['ipaSha256'].match?(/\A[0-9a-f]{64}\z/)
      raise 'Missing signed IPA digest'
    end
    %w[sourceSha acceptedSha version buildNumber runId].each do |field|
      raise "Missing candidate #{field}" unless candidate[field].is_a?(String) && !candidate[field].empty?
    end
    unless candidate['sourceSha'].match?(/\A[0-9a-f]{40}\z/) && candidate['acceptedSha'] == candidate['sourceSha']
      raise 'Candidate was not accepted by quality at the exact source commit'
    end
    raise 'Invalid candidate version' unless candidate['version'].match?(/\A\d+\.\d+\.\d+\z/)
    raise 'Invalid build number' unless candidate['buildNumber'].match?(/\A[1-9]\d{0,3}\.\d{1,2}\z/)
    candidate
  end

  def self.verify_build(build, candidate)
    unless build.app&.id == APP_ID && build.app_version == candidate['version'] &&
           build.version == candidate['buildNumber'] && build.pre_release_version&.platform == 'IOS'
      raise 'Apple returned a different app, product version, platform, or build number'
    end
    raise 'Build has expired' if build.expired
    raise "Apple processing failed: #{build.processing_state}" if %w[FAILED INVALID].include?(build.processing_state)
  end

  def self.wait_for_build(api, candidate, pause, clock, timeout)
    deadline = clock.call + timeout
    loop do
      builds = api.find_builds(candidate['version'], candidate['buildNumber'])
      raise 'Ambiguous exact build identity' if builds.length > 1
      build = builds.first
      if build
        verify_build(build, candidate)
        return build if build.processing_state == 'VALID' && build.build_beta_detail &&
                        build.build_beta_detail.external_build_state != 'PROCESSING'
      end
      remaining = deadline - clock.call
      raise 'Apple processing timeout; no review was submitted' unless remaining.positive?
      pause.call([300, remaining].min)
    end
  end

  def self.numeric_version(value)
    raise "Unknown Apple version format: #{value}" unless value.is_a?(String) && value.match?(/\A\d+(\.\d+){0,2}\z/)
    parts = value.split('.').map(&:to_i)
    parts + [0] * (3 - parts.length)
  end

  def self.expire_older_builds(api, candidate, current)
    current_order = numeric_version(candidate['version']) + numeric_version(candidate['buildNumber'])
    older = api.list_builds.select do |build|
      raise 'Apple returned a build from another app' unless build.app&.id == APP_ID
      raise 'Apple returned a build without a platform' unless build.pre_release_version&.platform
      next false if build.pre_release_version.platform != 'IOS' || build.id == current.id ||
                    build.expired || build.processing_state != 'VALID'
      order = numeric_version(build.app_version) + numeric_version(build.version)
      (order <=> current_order).negative?
    end
    older.map do |build|
      replacement = api.reload_build(current.id)
      verify_build(replacement, candidate)
      unless ACCEPTED.include?(replacement.build_beta_detail&.external_build_state)
        raise 'Replacement review submission is no longer confirmed'
      end
      api.expire_build(build)
      confirmed = api.reload_build(build.id)
      unless confirmed&.id == build.id && confirmed.app&.id == APP_ID && confirmed.expired == true
        raise "Apple did not confirm expiration: #{build.id}"
      end
      puts "Expired older iPhone TestFlight build #{build.app_version} (#{build.version}), id #{build.id}"
      build.id
    end
  end

  def self.distribute(api:, candidate:, pause: ->(seconds) { sleep(seconds) },
                      clock: -> { Process.clock_gettime(Process::CLOCK_MONOTONIC) }, timeout: 3600)
    verify_candidate(candidate)
    build = wait_for_build(api, candidate, pause, clock, timeout)
    state = build.build_beta_detail.external_build_state
    raise "External testing is unavailable: #{state}" if TERMINAL_FAILURE.include?(state)
    unless [true, false].include?(build.uses_non_exempt_encryption) &&
           !%w[MISSING_EXPORT_COMPLIANCE IN_EXPORT_COMPLIANCE_REVIEW].include?(state)
      raise 'Export compliance is unresolved; it must not be guessed by automation'
    end
    unless state == 'READY_FOR_BETA_SUBMISSION' || ACCEPTED.include?(state)
      raise "Unexpected external build state: #{state}"
    end
    api.ensure_external_group(build, GROUP_ID)
    api.enable_automatic_notification(build) unless build.build_beta_detail.auto_notify_enabled
    api.submit_review(build) if state == 'READY_FOR_BETA_SUBMISSION'
    current = api.reload_build(build.id)
    verify_build(current, candidate)
    final_state = current.build_beta_detail&.external_build_state
    raise "Review submission not confirmed: #{final_state}" unless ACCEPTED.include?(final_state)
    expired_ids = expire_older_builds(api, candidate, current)
    candidate.merge('appId' => APP_ID, 'buildId' => build.id, 'groupId' => GROUP_ID,
                    'expiredBuildIds' => expired_ids,
                    'externalBuildState' => final_state, 'channel' => 'testflight',
                    'invitationUrl' => 'https://testflight.apple.com/join/PszuhyJA')
  end
end
