import {Post, Tag} from '../models'

let tagNames2TagIds = async(tagNames) => {
  let tags = []
  // 去重
  let _tagNames = tagNames.filter((item, pos) => tagNames.indexOf(item) === pos)
  // 外键引用
  for (let i = 0; i < _tagNames.length; i++) {
    let name = _tagNames[i]
    if (name.length === 24) {
      tags.push(name)
      continue
    }
    let tag = (await Tag.findOne({name})) || (await new Tag({name}).save())
    tags.push(tag._id)
  }

  return tags
}


export default {
  'GET /posts': async(ctx, next) => {
    let groupBy = ctx.query.groupBy
    let data
    switch (groupBy) {
      case 'date':
        data = await Post.aggregate([
          {$match: {isArticle: true}},
          {
            $group: {
              _id: {month: {$month: "$createdAt"}, year: {$year: "$createdAt"}},
              posts: {$push: {_id: "$_id", title: "$title", slug: "$slug"}}
            }
          }])
        data.forEach(item => {
          item.date = item._id
          delete item._id
        })
        break
      case 'tag':
        data = await Post.aggregate([
          {$match: {isArticle: true}},
          {$unwind: '$tags'},
          {
            $group: {
              _id: '$tags',
              posts: {$push: {_id: "$_id", title: "$title", slug: "$slug"}}
            }
          }
        ])
        data.forEach(item => {
          item.tag = item._id
          delete item._id
        })
        data = await Tag.populate(data, {path: 'tag'})
        break
      default:
        data = await Post.find({isArticle: true}).populate('tags')
    }
    ctx.response.body = {
      'data': data
    };
  },
  'GET /posts/tags/:id': async(ctx, next) => {
    ctx.response.body = {
      'data': await Post.find({tags: {$in: [ctx.params.id]}}).populate('tags')
    };
  },
  'GET /posts/:slug': async(ctx, next) => {
    let slug = ctx.params.slug;
    let post = await Post.findOne({slug}).populate('tags')
    if (post && post._id && post.isArticle) {
      let fields = {title: 1, slug: 1}
      let tags = []
      post.tags.forEach(item => tags.push(item._id))
      post._doc.previous = (await Post.find({_id: {$lt: post._id}, isArticle: true}, fields).sort({_id: 1}).limit(1))[0]
      post._doc.next = (await Post.find({_id: {$gt: post._id}, isArticle: true}, fields).sort({_id: 1}).limit(1))[0]
      post._doc.related = await Post.find({tags: {$in: tags}, _id: {$ne: post._id}, isArticle: true}, fields)
    }
    ctx.response.body = {
      'data': post
    };
  },

  'POST /posts': async(ctx, next) => {
    let body = ctx.request.body
    let _id = body._id, post

    body.tags = await tagNames2TagIds(body.tags)
    if (_id && _id.length === 24) {
      post = await Post.findOne({_id})
    }
    if (post) {
      post.set('content', body.content)
      post.set('slug', body.slug)
      post.set('tags', body.tags)
      post.set('canComment', body.canComment !== false)
      post.set('isArticle', body.isArticle !== false)
    } else {
      delete body._id
      post = new Post(body)
    }
    try {
      await post.save()
      ctx.response.body = {
        'data': post
      };
    } catch (e) {
      ctx.response.body = {
        'message': e.message,
        'data': null
      };
    }
  }
}