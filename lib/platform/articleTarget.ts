export const NATIVE_ARTICLE_TARGET_COMMANDS = {
  loadArticleTargets: 'load_article_targets',
  selectArticleTarget: 'select_article_target',
  sendArticleToEdge: 'send_article_to_edge',
  openLocalPath: 'open_local_path',
} as const;

export interface ArticleTarget {
  id: string;
  name: string;
}

export interface ArticleTargetSettings {
  selected: ArticleTarget | null;
  available: ArticleTarget[];
}

export interface ArticleBody {
  title: string;
  markdown: string;
}
