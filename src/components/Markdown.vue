<template>
  <div class="markdown-body" v-html="marked">
  </div>
</template>

<script>
import MarkdownIt from 'markdown-it';
import Footnote from 'markdown-it-footnote';
import Deflist from 'markdown-it-deflist';
import Abbr from 'markdown-it-abbr';
import Anchor from 'markdown-it-anchor';
import Toc from 'markdown-it-table-of-contents';
import TaskLists from 'markdown-it-task-lists';
import Attrs from 'markdown-it-attrs';
import Sup from 'markdown-it-sup';
import Sub from 'markdown-it-sub';
import Emoji from 'markdown-it-emoji';
import ImplicitFigures from 'markdown-it-implicit-figures';
import MultimdTable from 'markdown-it-multimd-table';
import Include from 'markdown-it-include';
import Imsize from 'markdown-it-imsize';
import LinkifyImages from 'markdown-it-linkify-images';
import Underline from 'markdown-it-underline';
import Katex from '@neilsustc/markdown-it-katex';
import hljs from 'highlight.js';

export default {
  name: 'Markdown',
  props: {
    source: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      md: new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
        highlight(str, lang) {
          if (lang && hljs.getLanguage(lang)) {
            try {
              return '<pre class="hljs"><code>' + hljs.highlight(lang, str).value + '</code></pre>';
            } catch (err) {
              return err;
            }
          }

          return '';
        }
      }).use(
        Footnote
      ).use(
        Deflist
      ).use(
        Abbr
      ).use(
        Anchor,
        {
          permalink: true,
          permalinkBefore: true
        }
      ).use(
        Toc,
        {
          includeLevel: [2, 3, 4, 5]
        }
      ).use(
        TaskLists
      ).use(
        Attrs
      ).use(
        Sup
      ).use(
        Sub
      ).use(
        Emoji
      ).use(
        ImplicitFigures
      ).use(
        MultimdTable,
        {
          enableRowspan: true,
          enableMultilineRows: true
        }
      ).use(
        Include
      ).use(
        Imsize
      ).use(
        LinkifyImages
      ).use(
        Underline
      ).use(
        Katex
      )
    };
  },
  computed: {
    marked() {
      return this.md.render(this.source);
    }
  }
};
</script>

<style lang="less">
@import (css) "~github-markdown-css/github-markdown.css";
@import (css) "~katex/dist/katex.min.css";

#grids {
  #main {
    main {
      #report {
        .markdown-body {
          padding: 1em;
          font-family: serif;

          strong {
            font-weight: bold;
          }

          em {
            font-style: italic;
          }

          .footnotes {
            word-break: break-word;
          }

          .hljs {
            /* 4K */
            @media (orientation: landscape) and (max-width: 3840px) {
              max-width: 3072px;
            }

            @media (orientation: portrait) and (max-width: 2160px) {
              max-width: 1728px;
            }

            /* WQHD */
            @media (orientation: landscape) and (max-width: 2560px) {
              max-width: 2048px;
            }

            @media (orientation: portrait) and (max-width: 1440px) {
              max-width: 1152px;
            }

            /* Desktop or Laptop (Full HD) */
            @media (orientation: landscape) and (max-width: 1920px) {
              max-width: 1536px;
            }

            @media (orientation: portrait) and (max-width: 1080px) {
              max-width: 864px;
            }

            /* iPad (up to 12 inchs) */
            @media (orientation: landscape) and (max-width: 1366px) {
              max-width: 1092px;
            }

            @media (orientation: portrait) and (max-width: 1024px) {
              max-width: 819px;
            }

            /* iPhone (up to X) */
            @media (orientation: landscape) and (max-width: 812px) {
              max-width: 649px;
            }

            @media (orientation: portrait) and (max-width: 375px) {
              max-width: 300px;
            }

            /* Android (based on Pixel XL) */
            @media (orientation: landscape) and (max-width: 640px) {
              max-width: 512px;
            }

            @media (orientation: portrait) and (max-width: 360px) {
              max-width: 288px;
            }
          }

          &:extend(.markdown-body all);
          &:extend(.katex all);
        }
      }
    }
  }
}
</style>
