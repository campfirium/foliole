import { FileText, Globe, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import appIcon from '../../assets/brand/foliole-app-icon.png';
import { useLocalization, useTranslation } from '../shared/localization/LocalizationProvider';
import { loadInstalledCompanionVersion } from '../shared/platform/companion/runtime/installedAppVersion';
import { isCompanionNativeHost } from '../shared/platform/companionRuntimeCapabilities';
import { FOLIOLE_RELEASE_LINKS } from '../shared/platform/releaseLinks';
import { Github, Youtube } from '../shared/ui/BrandIcons';

import { CompanionListRow, CompanionListSection } from './CompanionListSurface';

export function CompanionAboutSettingsContent() {
  const t = useTranslation();
  const { locale } = useLocalization();
  const [version, setVersion] = useState<Awaited<ReturnType<typeof loadInstalledCompanionVersion>>>();
  useEffect(() => {
    let active = true;
    void loadInstalledCompanionVersion().then(info => {
      if (active) setVersion(info);
    }).catch(() => {
      if (active) setVersion(null);
    });
    return () => { active = false; };
  }, []);
  const openInNewTab = !isCompanionNativeHost();
  const website = locale === 'zh-Hans' ? 'https://foliole.app/zh-hans/' : FOLIOLE_RELEASE_LINKS.homepage;
  const rows = [
    [
      { title: t('companion.settings.about.changelog'), Icon: FileText, url: `${website}changelog/` },
      { title: t('companion.settings.about.privacy'), Icon: ShieldCheck, url: `${website}privacy/` }
    ],
    [
      { title: 'Homepage', Icon: Globe, url: website },
      { title: 'GitHub', Icon: Github, url: FOLIOLE_RELEASE_LINKS.repository },
      { title: 'Discuss', Icon: Github, url: FOLIOLE_RELEASE_LINKS.discussions },
      { title: 'YouTube', Icon: Youtube, url: FOLIOLE_RELEASE_LINKS.youtubePlaylist }
    ]
  ];

  return <section className="pb-5">
    <div className="flex flex-col items-center gap-2 py-5 text-center">
      <img src={appIcon} alt="" className="h-[60px] w-[60px]" />
      <strong className="text-xl font-semibold">Foliole</strong>
      {version === undefined ? null : <p className="text-sm text-companion-text-secondary">
        {version ? `${version.version} (${version.build})` : t('companion.settings.about.versionUnavailable')}
      </p>}
    </div>
    {rows.map((group, index) => <CompanionListSection key={group[0]?.url} isFirst={index === 0}>
      {group.map(({ title, Icon, url }) => <CompanionListRow key={url} ariaLabel={title} Icon={Icon}
        title={title} href={url} openInNewTab={openInNewTab} showIcon />)}
    </CompanionListSection>)}
  </section>;
}
