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
              return hljs.highlight(lang, str).value;
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
        Anchor
      ).use(
        Toc
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
        MultimdTable
      ).use(
        Include
      ).use(
        Imsize
      ).use(
        LinkifyImages
      ).use(
        Underline
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

#grids {
  #main {
    main {
      #report {
        .markdown-body {
          padding: 1em;
          font-family: serif;

          &:extend(.markdown-body all);
        }
      }
    }
  }
}
</style>
