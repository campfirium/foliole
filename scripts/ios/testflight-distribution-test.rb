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
      @build
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
      receipt = distribute(pause: ->(_) { flunk 'Must not wait for approval' })
      assert_equal state, receipt['externalBuildState']
      refute @api.calls.any? { |call| call.first == :submit }
    end
  end

  def test_rejection_is_not_retried_automatically
    @api = Api.new('BETA_REJECTED')
    assert_raises(RuntimeError) { distribute }
    assert @api.calls.all? { |call| call.first == :find }
  end
end
