import { listTags } from '~/server/utils/questions'

export default defineEventHandler(() => {
  return {
    tags: listTags()
  }
})
