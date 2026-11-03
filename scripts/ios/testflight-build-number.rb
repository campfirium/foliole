# frozen_string_literal: true

module FolioleTestflight
  # Both QA and release uploads hold the same Actions concurrency lock.
  def self.next_build_number(latest)
    value = latest.to_s
    unless value.match?(/\A(?:0|[1-9]\d{0,3}(?:\.\d{1,2}){0,2})\z/)
      raise 'Unsupported existing Apple build number; inspect it before uploading'
    end
    major = value.split('.').first.to_i + 1
    raise 'Apple build number range exhausted' if major > 9999
    "#{major}.1"
  end
end
