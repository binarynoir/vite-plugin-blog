import { posts } from "virtual:blog/posts";

document.body.dataset.posts = String(posts.length);
