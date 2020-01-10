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
    // 記事の目次をメニューにコピーする.
    let toc = document.getElementsByClassName('table-of-contents')
    let menu = document.getElementById('menu')
    let submenu = document.createElement('div')
    let nav = document.createElement('nav')

    submenu.id = 'submenu'
    nav.innerHTML = toc[0].innerHTML
    submenu.appendChild(nav)
    menu.appendChild(submenu)

    // 記事中の目次を削除する.
    for (let i = 0; i < toc.length; i++) {
      toc[i].innerHTML = null
    }
  }
}
</script>

<style lang="less">
@import "~github-markdown-css/github-markdown.css";
@import "~katex/dist/katex.min.css";
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
