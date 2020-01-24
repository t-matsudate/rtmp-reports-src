<template>
  <div class="markdown-body" v-html="source"></div>
</template>

<script>
export default {
  props: {
    source: {
      type: String,
      required: true
    }
  },
  mounted() {
    let oldSubmenu = document.getElementById('submenu')

    if (oldSubmenu === null) {
      // 記事の目次をメニューにコピーする.
      let toc = document.getElementsByClassName('table-of-contents')[0]
      let menu = document.getElementById('menu')
      let submenu = document.createElement('div')
      let nav = document.createElement('nav')

      submenu.id = 'submenu'
      nav.innerHTML = toc.innerHTML
      submenu.appendChild(nav)
      menu.appendChild(submenu)

      // 記事中の目次を削除する.
      toc.outerHTML = null
    } else {
      /* すでにある場合は上書きする. (記事の目次が変更された場合も考慮) */
      let toc = document.getElementsByClassName('table-of-contents')[0]
      let nav = oldSubmenu.getElementsByTagName('nav')[0]

      nav.innerHTML = toc.innerHTML
      toc.outerHTML = null
    }
  }
}
</script>

<style lang="less">
@import "~github-markdown-css/github-markdown.css";
@import "~katex/dist/katex.min.css";
@import "~highlight.js/styles/github.css";
@import "~assets/less/markdown";

#grids {
  #main {
    main {
      article {
        &:extend(.markdown-body all);
        &:extend(.katex all);
      }
    }
  }
}
</style>
