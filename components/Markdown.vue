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
    /* 現在描画している記事のタイトルをヘッダにコピーし, メニューをハイライトする. */
    // 文書の構造上, 先頭は必ずヘッダの要素である.
    let articleTitle = document.getElementsByTagName('h1')[1].innerHTML
    let menu = document.getElementById('menu-list').getElementsByTagName('li')

    for (let i = 0; i < menu.length; i++) {
      if (menu[i].getElementsByTagName('a')[0].innerHTML === articleTitle) {
        menu[i].id = 'current-article'
        document.getElementById('app-title').innerHTML = articleTitle
        break
      }
    }

    let oldSubmenu = document.getElementById('submenu')

    if (oldSubmenu === null) {
      /* 記事の目次をメニューにコピーする. */
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
  },
  destroyed() {
    let menu = document.getElementById('menu-list').getElementsByTagName('li')

    for (let i = 0; i < menu.length; i++) {
      if (menu[i].id) {
        menu[i].removeAttribute('id')
      }
    }

    document.getElementById('submenu').outerHTML = null
    document.getElementById('app-title').innerHTML = 'RTMP Implementation Reports'
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
