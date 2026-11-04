# frozen_string_literal: true
require 'minitest/autorun'
require 'ostruct'
require_relative 'testflight-distribution'

class DistributionTest < Minitest::Test
  class Api
    attr_reader :calls, :build
    def initialize(state = 'READY_FOR_BETA_SUBMISSION')
      @calls = []
      @build = OpenStruct.new(id: 'build-id', app: OpenStruct.new(id: FolioleTestflight::APP_ID),
        app_version: '0.7.18', version: '321.2', expired: false, processing_state: 'VALID',
        uses_non_exempt_encryption: true, pre_release_version: OpenStruct.new(platform: 'IOS'),
        build_beta_detail: OpenStruct.new(external_build_state: state, auto_notify_enabled: false))
    end
    def find_builds(version, number)
      @calls << [:find, version, number]
      [@build]
    end
    def ensure_external_group(build, group)
      @calls << [:group, build.id, group]
    end
    def enable_automatic_notification(build)
      @calls << [:notify]
      build.build_beta_detail.auto_notify_enabled = true
    end
    def submit_review(build)
      @calls << [:submit]
      build.build_beta_detail.external_build_state = 'WAITING_FOR_BETA_REVIEW'
    end
    def reload_build(id)
      @calls << [:reload, id]
      [@build, *@older_builds].find { |entry| entry.id == id }
    end
    attr_writer :older_builds
    def list_builds
      @calls << [:list]
      [@build, *@older_builds]
    end
    def expire_build(build)
      @calls << [:expire, build.id]
      build.expired = true
    end
  end

  def setup
    @candidate = { 'schemaVersion' => 1, 'ipaSha256' => 'b' * 64, 'sourceSha' => 'a' * 40, 'acceptedSha' => 'a' * 40,
      'version' => '0.7.18', 'buildNumber' => '321.2', 'runId' => '123' }
    @api = Api.new
  end

  def distribute(**options)
    FolioleTestflight.distribute(api: @api, candidate: @candidate, **options)
  end

  def test_processing_handoff_submits_once_and_exits_before_human_review
    @api.build.processing_state = 'PROCESSING'
    now = 0
    pauses = []
    receipt = distribute(clock: -> { now }, pause: lambda { |seconds|
      pauses << seconds
      now += seconds
      @api.build.processing_state = 'VALID'
    })
    assert_equal [300], pauses
    assert_equal 'WAITING_FOR_BETA_REVIEW', receipt['externalBuildState']
    assert_equal FolioleTestflight::GROUP_ID, receipt['groupId']
    assert_equal [[:submit]], @api.calls.select { |call| call.first == :submit }
    assert @api.build.build_beta_detail.auto_notify_enabled
    distribute(pause: ->(_) { flunk 'Must not wait for approval' })
    assert_equal 1, @api.calls.count { |call| call.first == :submit }
  end

  def test_timeout_does_not_assign_notify_or_submit
    @api.build.processing_state = 'PROCESSING'
    now = 0
    error = assert_raises(RuntimeError) do
      distribute(timeout: 600, clock: -> { now }, pause: ->(seconds) { now += seconds })
    end
    assert_match(/timeout/, error.message)
    assert_equal 600, now
    assert @api.calls.all? { |call| call.first == :find }
  end

  def test_export_compliance_is_never_guessed
    [nil, 'unknown'].each do |value|
      @api = Api.new
      @api.build.uses_non_exempt_encryption = value
      assert_raises(RuntimeError) { distribute }
      assert @api.calls.all? { |call| call.first == :find }
    end
    %w[MISSING_EXPORT_COMPLIANCE IN_EXPORT_COMPLIANCE_REVIEW].each do |state|
      @api = Api.new(state)
      assert_raises(RuntimeError) { distribute }
      assert @api.calls.all? { |call| call.first == :find }
    end
  end

  def test_failed_or_wrong_builds_are_rejected_before_distribution
    [{ processing_state: 'FAILED' }, { app_version: '0.7.19' },
     { version: '321.1' }, { expired: true }].each do |changes|
      @api = Api.new
      changes.each { |key, value| @api.build.public_send("#{key}=", value) }
      assert_raises(RuntimeError) { distribute }
      assert @api.calls.all? { |call| call.first == :find }
    end
    @candidate['acceptedSha'] = 'b' * 40
    @api = Api.new
    assert_raises(RuntimeError) { distribute }
    assert_empty @api.calls
  end

  def test_existing_review_and_approved_states_are_not_resubmitted
    FolioleTestflight::ACCEPTED.each do |state|
      @api = Api.new(state)
      old = old_build('old')
      @api.older_builds = [old]
      receipt = distribute(pause: ->(_) { flunk 'Must not wait for approval' })
      assert_equal state, receipt['externalBuildState']
      refute @api.calls.any? { |call| call.first == :submit }
      assert old.expired
    end
  end

  def test_rejection_is_not_retried_automatically
    @api = Api.new('BETA_REJECTED')
    assert_raises(RuntimeError) { distribute }
    assert @api.calls.all? { |call| call.first == :find }
  end

  def old_build(id, version: '0.7.18', number: '321.1', **changes)
    OpenStruct.new(@api.build.to_h.merge(id: id, app_version: version, version: number).merge(changes))
  end

  def test_submission_immediately_expires_older_builds_without_waiting_for_approval
    old = old_build('old', number: '9.1')
    previous = old_build('previous', version: '0.7.17', number: '999.1')
    @api.older_builds = [old, previous]
    receipt = distribute(pause: ->(_) { flunk 'Must not wait for approval' })
    assert_equal 'WAITING_FOR_BETA_REVIEW', receipt['externalBuildState']
    assert old.expired, 'The old build must expire as part of publishing the new build'
    assert previous.expired
    refute @api.build.expired
    assert_operator @api.calls.index([:submit]), :<, @api.calls.index([:expire, 'old'])
    assert_equal %w[old previous], receipt['expiredBuildIds']
  end

  def test_current_newer_expired_failed_and_other_platform_builds_are_preserved
    newer = old_build('newer', number: '322.1')
    next_version = old_build('next', version: '0.7.19', number: '1')
    expired = old_build('expired', expired: true)
    failed = old_build('failed', processing_state: 'FAILED')
    processing = old_build('processing', processing_state: 'PROCESSING')
    mac = old_build('mac', pre_release_version: OpenStruct.new(platform: 'MAC_OS'))
    @api.older_builds = [newer, next_version, expired, failed, processing, mac]
    distribute
    assert_empty @api.calls.select { |call| call.first == :expire }
  end

  def test_version_and_build_order_is_numeric_and_missing_components_are_zero
    @candidate['version'] = @api.build.app_version = '0.10.0'
    @candidate['buildNumber'] = @api.build.version = '2.1'
    old = old_build('legacy', version: '0.9.0', number: '99')
    same = old_build('same', version: '0.10.0', number: '2.1.0')
    @api.older_builds = [old, same]
    distribute
    assert old.expired
    refute same.expired
  end

  def test_retries_continue_after_partial_expiration_without_resubmitting_review
    first = old_build('first')
    second = old_build('second')
    @api.older_builds = [first, second]
    @api.define_singleton_method(:expire_build) do |build|
      raise 'Apple unavailable' if build.id == 'second' && !@retried
      @calls << [:expire, build.id]
      build.expired = true
    end
    assert_raises(RuntimeError) { distribute }
    assert first.expired
    refute second.expired
    @api.instance_variable_set(:@retried, true)
    distribute
    distribute
    assert second.expired
    assert_equal 1, @api.calls.count { |call| call == [:submit] }
    assert_equal 1, @api.calls.count { |call| call == [:expire, 'first'] }
    assert_equal 1, @api.calls.count { |call| call == [:expire, 'second'] }
  end

  def test_unconfirmed_submission_does_not_expire_anything
    old = old_build('old')
    @api.older_builds = [old]
    @api.define_singleton_method(:submit_review) { |_| }
    assert_raises(RuntimeError) { distribute }
    refute old.expired
  end

  def test_wrong_app_or_unknown_version_refuses_expiration_before_any_write
    [old_build('wrong', app: OpenStruct.new(id: 'other-app')),
     old_build('unknown', number: 'unknown')].each do |invalid|
      old = old_build('old')
      @api.older_builds = [old, invalid]
      assert_raises(RuntimeError) { distribute }
      refute old.expired
    end
  end

  def test_expiration_must_be_confirmed_by_apple
    @api.older_builds = [old_build('old')]
    @api.define_singleton_method(:expire_build) { |_| }
    assert_raises(RuntimeError) { distribute }
  end

  def test_replacement_must_remain_valid_during_expiration
    old = old_build('old')
    @api.older_builds = [old]
    @api.define_singleton_method(:list_builds) do
      @build.expired = true
      [@build, *@older_builds]
    end
    assert_raises(RuntimeError) { distribute }
    refute old.expired
  end
end
