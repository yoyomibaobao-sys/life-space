-- 允许评论作者删除自己的评论；也允许记录主人删除自己记录下的评论。
-- 执行后，前端“删除评论”按钮才能让记录主人删除别人留在自己记录下的评论。

DROP POLICY IF EXISTS comments_delete_own ON public.comments;
DROP POLICY IF EXISTS comments_delete_own_or_record_owner ON public.comments;

CREATE POLICY comments_delete_own_or_record_owner
ON public.comments
FOR DELETE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.records r
    WHERE r.id = comments.record_id
      AND r.user_id = auth.uid()
  )
);
