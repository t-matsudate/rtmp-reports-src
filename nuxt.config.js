import Footnote from 'markdown-it-footnote'
import Deflist from 'markdown-it-deflist'
import Abbr from 'markdown-it-abbr'
import Anchor from 'markdown-it-anchor'
import Toc from 'markdown-it-table-of-contents'
import TaskLists from 'markdown-it-task-lists'
import Attrs from 'markdown-it-attrs'
import Sup from 'markdown-it-sup'
import Sub from 'markdown-it-sub'
import Emoji from 'markdown-it-emoji'
import ImplicitFigures from 'markdown-it-implicit-figures'
import MultimdTable from 'markdown-it-multimd-table'
import Include from 'markdown-it-include'
import Imsize from 'markdown-it-imsize'
import LinkifyImages from 'markdown-it-linkify-images'
import Underline from 'markdown-it-underline'
import Katex from '@neilsustc/markdown-it-katex'
import PlantUML from 'markdown-it-plantuml'
import hljs from 'highlight.js'

export default {
  mode: 'spa',
  head: {
    meta: [
      { charset: 'utf-8' },
      {
        'http-equiv': 'X-UA-Compatible',
        content: 'IE=edge'
      },
      {
        hid: 'viewport',
        name: 'viewport',
        content: 'width=device-width, initial-scale=1'
      },
      {
        hid: 'author',
        name: 'author',
        content: 'T.Matsudate'
      },
      {
        hid: 'generator',
        name: 'generator',
        content: 'Nuxt.js'
      },
      {
        hid: 'keyword',
        name: 'keyword',
        content: 'func,func_hs,GitHub Pages,T.Matsudate,t-matsudate,Vue.js,Nuxt.js,less,rtmp,RTMP'
      },
      {
        hid: 'creator',
        name: 'creator',
        content: 'T.Matsudate'
      },
      {
        hid: 'publisher',
        name: 'publisher',
        content: 'T.Matsudate'
      },
    ],
    link: [
      {
        rel: 'icon',
        type: 'image/x-icon',
        href: process.env.DEPLOY_ENV == 'GH_PAGES' ? '/rtmp-reports/favicon.ico' : '/favicon.ico'
      },
      {
        rel: 'stylesheet',
        href: 'https://use.fontawesome.com/releases/v5.12.1/css/solid.css'
      },
      {
        rel: 'stylesheet',
        href: 'https://use.fontawesome.com/releases/v5.12.1/css/brands.css'
      },
      {
        rel: 'stylesheet',
        href: 'https://use.fontawesome.com/releases/v5.12.1/css/fontawesome.css'
      },
    ],
    script: [
      {
        async: true,
        src: 'https://platform.twitter.com/widgets.js',
        charset: 'utf-8'
      },
    ]
  },
  loading: {
    color: '#666666',
    failedColor: '#b71414',
    height: '1em'
  },
  css: [
  ],
  plugins: [
  ],
  buildModules: [
  ],
  modules: [
  ],
  build: {
    extend (config, ctx) {
      config.module.rules = [
        {
          test: /\.md$/,
          use: [
            'raw-loader',
            {
              loader: 'markdown-it-loader',
              options: {
                html: true,
                linkify: true,
                typographer: true,
                highlight: (str, lang) => {
                  if (lang && hljs.getLanguage(lang)) {
                    try {
                      return '<pre class="hljs"><code>' + hljs.highlight(lang, str).value + '</code></pre>'
                    } catch (err) {
                      return err
                    }
                  }

                  return ''
                },
                use: [
                  Footnote,
                  Deflist,
                  Abbr,
                  [
                    Anchor,
                    {
                      permalink: true,
                      permalinkBefore: true
                    }
                  ],
                  [
                    Toc,
                    {
                      includeLevel: [2, 3, 4, 5]
                    }
                  ],
                  TaskLists,
                  Attrs,
                  Sup,
                  Sub,
                  Emoji,
                  ImplicitFigures,
                  [
                    MultimdTable,
                    {
                      rawspan: true,
                      multiline: true
                    }
                  ],
                  [
                    Include,
                    {
                      root: 'assets/markdowns/include'
                    }
                  ],
                  Imsize,
                  LinkifyImages,
                  Underline,
                  Katex,
                  PlantUML
                ]
              }
            }
          ],
        },
        {
          test: /\.flow$/,
          loader: 'raw-loader'
        },
        {
          test: /\.vue$/,
          loader: 'vue-loader'
        },
        {
          test: /\.less$/,
          use: ['style-loader', 'css-loader', 'less-loader']
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /(\.ttf$|\.woff$|\.woff2)/,
          loader: 'file-loader'
        }
      ]
      config.externals = {
        fs: 'fs-extra'
      }
    },
    loaders: {
      file: {},
      fontUrl: { limit: 1000 },
      imageUrl: { limit: 1000 },
      pugPlane: {},
      vue: {
        transformAssetUrls: {
          video: 'src',
          audio: 'src',
          source: 'src',
          object: 'src',
          embed: 'src'
        }
      },
      css: {},
      cssModules: {
        localIdentName: '[local]_[hash:base64:5]'
      },
      less: {},
      sass: {
        indentedSyntax: true
      },
      scss: {},
      stylus: {},
      vueStyle: {},
      raw: {},
      'markdown-it': {}
    }
  },
  router: {
    base: process.env.DEPLOY_ENV === 'GH_PAGES' ? '/rtmp-reports/' : '/'
  }
}
