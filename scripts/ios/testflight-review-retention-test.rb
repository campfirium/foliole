# frozen_string_literal: true
require_relative 'testflight-distribution-test'

class DistributionTest
  def test_review_handoff_preserves_the_available_build_across_retries
    %w[WAITING_FOR_BETA_REVIEW IN_BETA_REVIEW].each do |state|
      @api = Api.new(state)
      old = old_build('available', version: '0.7.17')
      @api.older_builds = [old]
      2.times do
        receipt = distribute(pause: ->(_) { flunk 'Must exit before review approval' })
        refute old.expired, 'Testers must retain their available build while its replacement is under review'
        assert_empty receipt['expiredBuildIds']
      end
      refute @api.calls.any? { |call| %i[expire submit].include?(call.first) }
    end
  end

  def test_cleanup_refuses_a_replacement_still_under_review
    %w[WAITING_FOR_BETA_REVIEW IN_BETA_REVIEW].each do |state|
      @api = Api.new(state)
      @api.build.build_beta_detail.auto_notify_enabled = true
      old = old_build('available')
      @api.older_builds = [old]
      assert_raises(RuntimeError) do
        FolioleTestflight.expire_older_builds(@api, @candidate, @api.build)
      end
      refute old.expired
      refute @api.calls.any? { |call| call.first == :expire }
    end
  end

  def test_cleanup_rechecks_approval_before_each_expiration
    old = old_build('available')
    @api.older_builds = [old]
    @api.define_singleton_method(:list_builds) do
      @build.build_beta_detail.external_build_state = 'IN_BETA_REVIEW'
      [@build, *@older_builds]
    end
    assert_raises(RuntimeError) { expire_older_builds }
    refute old.expired
  end
end
