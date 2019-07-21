<template>
  <p id="author">
    {{ author }}<br />
    投稿日: <time :datetime="date">{{ date }}</time>
  </p>
</template>

<script>
export default {
  name: 'Author',
  props: {
    date: {
      type: String,
      required: true,
      validator: (date) => !isNaN(new Date(date))
    },
    author: {
      type: String,
      required: true
    }
  },
  mounted() {
    let head = document.getElementsByTagName('head')[0];
    let ogArticlePublished = document.createElement('meta');
    let ogArticleAuthor = document.createElement('meta');
    let tags = ['func', 'func-hs', 'func_hs', 't-matsudate', 't.matsudate', 'rtmp', 'RTMP', 'implementation', 'Implementation', '実装'];

    ogArticlePublished.setAttribute('property', 'og:article:published_time');
    ogArticlePublished.setAttribute('content', this.date);
    ogArticleAuthor.setAttribute('property', 'og:article:author');
    ogArticleAuthor.setAttribute('content', this.author);
    head.appendChild(ogArticlePublished);
    head.appendChild(ogArticleAuthor);

    tags.forEach(
      (tag) => {
        let ogArticleTag = document.createElement('meta');

        ogArticleTag.setAttribute('property', 'og:article:tag');
        ogArticleTag.setAttribute('content', tag);
        head.appendChild(ogArticleTag);
      }
    );
  }
}
</script>

<style lang="less">
#grids {
  #main {
    main {
      article {
        #author {
          padding: 1em;
          text-align: right;
          font-family: sans-serif;
        }
      }
    }
  }
}
</style>
