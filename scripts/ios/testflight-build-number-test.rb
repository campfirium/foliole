# frozen_string_literal: true
require 'minitest/autorun'
require 'tempfile'
require_relative 'testflight-build-number'

class TestflightBuildNumberTest < Minitest::Test
  def test_advances_above_prior_uploads_from_either_workflow
    assert_equal '1.1', FolioleTestflight.next_build_number(0)
    assert_equal '322.1', FolioleTestflight.next_build_number('321.99')
    assert_equal '323.1', FolioleTestflight.next_build_number('322.1')
    assert_equal '33.1', FolioleTestflight.next_build_number(32)
    assert_equal '10.1', FolioleTestflight.next_build_number('9.99.99')
  end

  def test_does_not_guess_an_unknown_number_or_exceed_apple_limits
    [nil, '', '2.beta', '9999.1', '10000', '3.100', '-1'].each do |value|
      assert_raises(RuntimeError) { FolioleTestflight.next_build_number(value) }
    end
  end
end

class TestflightLaneHarness
  attr_reader :lanes, :query
  attr_accessor :latest, :query_error

  def initialize
    @lanes = {}
    file = File.expand_path('fastlane/Fastfile', __dir__)
    instance_eval(File.read(file), file)
  end

  def opt_out_usage; end
  def default_platform(_name); end
  def desc(_text); end
  def platform(_name); yield; end
  def lane(name, &block); @lanes[name] = block; end
  def app_store_connect_api_key(**_options); { key: 'test-only' }; end

  def latest_testflight_build_number(**options)
    @query = options
    raise query_error if query_error
    latest
  end

  def prepare
    instance_exec(&lanes.fetch(:prepare_build))
  end
end

class TestflightAllocationLaneTest < Minitest::Test
  def with_lane
    keys = %w[GITHUB_ENV APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_API_KEY_BASE64]
    saved = keys.to_h { |key| [key, ENV[key]] }
    Tempfile.create('foliole-build-env') do |file|
      ENV['GITHUB_ENV'] = file.path
      keys.drop(1).each { |key| ENV[key] = 'test-only' }
      yield TestflightLaneHarness.new, file.path
    end
  ensure
    saved.each { |key, value| value.nil? ? ENV.delete(key) : ENV[key] = value }
  end

  def test_real_lane_allocates_from_apple_across_callers_without_run_counter
    with_lane do |lane, file|
      lane.latest = '321.99'
      lane.prepare
      assert_equal "FOLIOLE_IOS_BUILD_NUMBER=322.1\n", File.read(file)
      assert_equal 'com.campfirium.foliole.ios', lane.query[:app_identifier]
      assert_equal 'ios', lane.query[:platform]
      refute lane.query.key?(:version)
      lane.latest = '322.1'
      lane.prepare
      assert_equal "FOLIOLE_IOS_BUILD_NUMBER=322.1\nFOLIOLE_IOS_BUILD_NUMBER=323.1\n", File.read(file)
    end
  end

  def test_query_failure_does_not_write_an_invented_build_number
    with_lane do |lane, file|
      lane.query_error = 'Apple unavailable'
      assert_raises(RuntimeError) { lane.prepare }
      assert_empty File.read(file)
    end
  end
end
