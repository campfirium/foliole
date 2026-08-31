function Get-ObjectFacts($Value) {
  return [ordered]@{ count = [int]$Value.Count; runtimeType = $Value.GetType().FullName }
}

function Add-FlatStrings([object[]]$Values, [Collections.ArrayList]$Target) {
  foreach ($value in $Values) {
    if ($value -isnot [string]) { throw 'file set projection contains a non-string item' }
    [void]$Target.Add([string]$value)
  }
}

function Add-StableNames([object[]]$Values, [Collections.ArrayList]$Target) {
  $result = [string[]]$Values
  [Array]::Sort($result, [StringComparer]::OrdinalIgnoreCase)
  Add-FlatStrings -Values ([object[]]$result) -Target $Target
}

function Add-NameProjection([object[]]$Values, [Collections.ArrayList]$Target) {
  foreach ($name in $Values) {
    if ($name -isnot [string]) { throw 'file set projection contains a non-string item' }
    [void]$Target.Add([ordered]@{ name = [string]$name
      ordinalIgnoreCase = ([string]$name).ToLowerInvariant() })
  }
}

function Add-NameCollisions([object[]]$Values, [Collections.ArrayList]$Target) {
  $groups = @{}
  foreach ($name in $Values) {
    if ($name -isnot [string]) { throw 'file set projection contains a non-string item' }
    $key = ([string]$name).ToLowerInvariant()
    if (!$groups.ContainsKey($key)) { $groups[$key] = [Collections.ArrayList]::new() }
    [void]$groups[$key].Add([string]$name)
  }
  $keys = [Collections.ArrayList]::new()
  Add-StableNames -Values ([object[]]$groups.Keys) -Target $keys
  foreach ($key in $keys) {
    if ($groups[$key].Count -gt 1) {
      $names = [Collections.ArrayList]::new()
      Add-FlatStrings -Values ([object[]]$groups[$key]) -Target $names
      [void]$Target.Add([ordered]@{ count = [int]$names.Count; key = [string]$key
        names = $names })
    }
  }
}

function Add-NameDelta([object[]]$Left, [object[]]$Right, [Collections.ArrayList]$Target) {
  $rightSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($name in $Right) {
    if ($name -isnot [string]) { throw 'file set projection contains a non-string item' }
    [void]$rightSet.Add([string]$name)
  }
  $stable = [Collections.ArrayList]::new()
  Add-StableNames -Values $Left -Target $stable
  foreach ($name in $stable) {
    if (!$rightSet.Contains($name)) { [void]$Target.Add([string]$name) }
  }
}

function Add-CompareFacts([object[]]$Expected, [object[]]$Actual,
    [Collections.ArrayList]$Target) {
  foreach ($item in @(Compare-Object -ReferenceObject $Expected -DifferenceObject $Actual)) {
    [void]$Target.Add([ordered]@{ inputObject = [string]$item.InputObject
      sideIndicator = [string]$item.SideIndicator })
  }
}

function Confirm-Projection([object[]]$Missing, [object[]]$Extra, [object[]]$Collisions,
    [object[]]$Compare) {
  $rawMissing = [Collections.ArrayList]::new()
  $rawExtra = [Collections.ArrayList]::new()
  foreach ($item in $Compare) {
    if ($item.sideIndicator -eq '<=') {
      [void]$rawMissing.Add([string]$item.inputObject)
    } elseif ($item.sideIndicator -eq '=>') {
      [void]$rawExtra.Add([string]$item.inputObject)
    } else { throw 'file set compare projection contains an invalid side indicator' }
  }
  $stableMissing = [Collections.ArrayList]::new()
  $stableRawMissing = [Collections.ArrayList]::new()
  $stableExtra = [Collections.ArrayList]::new()
  $stableRawExtra = [Collections.ArrayList]::new()
  Add-StableNames -Values $Missing -Target $stableMissing
  Add-StableNames -Values ([object[]]$rawMissing) -Target $stableRawMissing
  Add-StableNames -Values $Extra -Target $stableExtra
  Add-StableNames -Values ([object[]]$rawExtra) -Target $stableRawExtra
  if (($stableMissing -join [char]0) -ne ($stableRawMissing -join [char]0) -or
      ($stableExtra -join [char]0) -ne ($stableRawExtra -join [char]0)) {
    throw 'file set delta projection invariant failed'
  }
  foreach ($group in $Collisions) {
    $names = [Collections.ArrayList]::new()
    Add-FlatStrings -Values ([object[]]$group.names) -Target $names
    if ($names.Count -lt 2 -or $names.Count -ne $group.count -or
        @($names | Where-Object { $_.ToLowerInvariant() -ne $group.key }).Count) {
      throw 'file set collision projection invariant failed'
    }
  }
}

function Confirm-CollectionProjectionSelfcheck {
  $list = [Collections.ArrayList]::new()
  [void]$list.Add('Alpha'); [void]$list.Add('beta')
  $cases = @(@{ input = [object[]]@(); count = 0 }, @{ input = 'Alpha'; count = 1 },
    @{ input = [object[]]@('Alpha'); count = 1 }, @{ input = $list; count = 2 },
    @{ input = [object[]]@('Alpha', 'beta'); count = 2 })
  foreach ($case in $cases) {
    $flat = [Collections.ArrayList]::new()
    Add-FlatStrings -Values ([object[]]$case.input) -Target $flat
    if ($flat.Count -ne $case.count) { throw 'file set collection projection selfcheck failed' }
  }
  $left = [object[]]@('Alpha', 'beta'); $right = [object[]]@('alpha', 'gamma')
  $compare = [Collections.ArrayList]::new()
  $missing = [Collections.ArrayList]::new()
  $extra = [Collections.ArrayList]::new()
  $collisions = [Collections.ArrayList]::new()
  Add-CompareFacts -Expected $left -Actual $right -Target $compare
  Add-NameDelta -Left $left -Right $right -Target $missing
  Add-NameDelta -Left $right -Right $left -Target $extra
  Add-NameCollisions -Values ([object[]]@('Alpha', 'alpha')) -Target $collisions
  Confirm-Projection -Missing $missing -Extra $extra -Collisions ([object[]]@()) -Compare $compare
  if ($missing[0] -ne 'beta' -or $extra[0] -ne 'gamma' -or
      @($compare | Where-Object { $_.sideIndicator -eq '<=' }).Count -ne 1 -or
      @($compare | Where-Object { $_.sideIndicator -eq '=>' }).Count -ne 1 -or
      $collisions.Count -ne 1 -or $collisions[0].names.Count -ne 2 -or
      $collisions[0].key -ne 'alpha') { throw 'file set collection delta selfcheck failed' }
  return [ordered]@{ caseCount = [int]$cases.Count; runtimeType = $list.GetType().FullName
    state = 'success' }
}

function Add-EntryFacts([string]$Root, [Collections.ArrayList]$Target) {
  foreach ($item in @(Get-ChildItem -LiteralPath $Root -Force)) {
    $type = if ($item.PSIsContainer) { 'directory' } else { 'file' }
    [void]$Target.Add([ordered]@{ attributes = [string]$item.Attributes
      name = [string]$item.Name
      reparsePoint = [bool](($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)
      type = $type })
  }
}
