-- Master Product Classification Engine — Signal Collection
-- Collects all raw signals from order data in one SQL function.
-- Called via PostgREST RPC: POST /rpc/get_product_signals

CREATE OR REPLACE FUNCTION get_product_signals(
  p_store_id text
)
RETURNS TABLE(
  product_id text,
  title text,

  -- PRICE SIGNALS
  avg_price numeric,
  min_price numeric,
  max_price numeric,
  has_heavy_discount boolean,
  price_gap_class text,
  price_ratio_to_order numeric,

  -- ALONE RATE SIGNALS
  total_orders bigint,
  alone_orders bigint,
  alone_rate numeric,

  -- REVENUE SIGNALS
  total_revenue numeric,
  revenue_share numeric,

  -- CO-OCCURRENCE SIGNALS
  always_with_other boolean,
  co_occur_rate numeric,
  co_occurs_with text,

  -- UPSELL APP SIGNALS
  has_upsell_stamps boolean,

  -- SKU SIGNALS
  sku_class text,

  -- CUSTOMER SIGNALS
  first_purchase_rate numeric,

  -- ORDER POSITION SIGNALS
  avg_position_in_order numeric,
  always_last boolean
) AS $$
  WITH

  -- Base order stats per product
  order_stats AS (
    SELECT
      li->>'product_id' as product_id,
      li->>'title' as title,
      li->>'sku' as sku,
      AVG((li->>'price')::numeric) as avg_price,
      MIN((li->>'price')::numeric) as min_price,
      MAX((li->>'price')::numeric) as max_price,
      COUNT(DISTINCT oc.order_id) as total_orders,
      SUM((li->>'price')::numeric * COALESCE((li->>'quantity')::numeric, 1)) as total_revenue,
      AVG(
        (SELECT pos FROM (
          SELECT item->>'product_id' as pid,
                 ROW_NUMBER() OVER () as pos
          FROM jsonb_array_elements(oc.line_items) item
        ) positions WHERE pid = li->>'product_id' LIMIT 1)
      ) as avg_position
    FROM shopify_orders_cache oc
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li
    WHERE oc.store_id = p_store_id
      AND oc.financial_status NOT IN ('voided', 'refunded')
      AND li->>'product_id' IS NOT NULL
      AND li->>'product_id' != ''
      AND li->>'product_id' != 'null'
    GROUP BY li->>'product_id', li->>'title', li->>'sku'
  ),

  -- Total store revenue
  store_total AS (
    SELECT
      COALESCE(SUM(total_revenue), 0) as grand_total,
      COALESCE(AVG(total_revenue), 0) as avg_order_value
    FROM order_stats
  ),

  -- Orders per product count (for alone_rate)
  order_product_counts AS (
    SELECT
      oc.order_id,
      COUNT(DISTINCT li->>'product_id') as product_count
    FROM shopify_orders_cache oc
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li
    WHERE oc.store_id = p_store_id
      AND oc.financial_status NOT IN ('voided', 'refunded')
      AND li->>'product_id' IS NOT NULL
      AND li->>'product_id' != ''
    GROUP BY oc.order_id
  ),

  -- Alone rate per product
  alone_stats AS (
    SELECT
      li->>'product_id' as product_id,
      COUNT(DISTINCT CASE
        WHEN opc.product_count = 1 THEN oc.order_id
      END) as alone_orders
    FROM shopify_orders_cache oc
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li
    JOIN order_product_counts opc ON opc.order_id = oc.order_id
    WHERE oc.store_id = p_store_id
      AND oc.financial_status NOT IN ('voided', 'refunded')
      AND li->>'product_id' IS NOT NULL
      AND li->>'product_id' != ''
    GROUP BY li->>'product_id'
  ),

  -- Upsell app stamps detection
  stamp_stats AS (
    SELECT
      li->>'product_id' as product_id,
      COUNT(DISTINCT CASE
        WHEN (li->'properties')::text ILIKE ANY(ARRAY[
          '%upsell%', '%_bump%', '%aftersell%', '%zipify%',
          '%bold%upsell%', '%honeycomb%', '%reconvert%',
          '%carthook%', '%_source%'
        ])
        THEN oc.order_id
      END) as stamped_orders,
      COUNT(DISTINCT oc.order_id) as total_orders
    FROM shopify_orders_cache oc
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li
    WHERE oc.store_id = p_store_id
      AND oc.financial_status NOT IN ('voided', 'refunded')
      AND li->>'product_id' IS NOT NULL
    GROUP BY li->>'product_id'
  ),

  -- First purchase rate (is this a customer's first order?)
  first_purchase AS (
    SELECT
      li->>'product_id' as product_id,
      COUNT(DISTINCT CASE
        WHEN NOT EXISTS (
          SELECT 1 FROM shopify_orders_cache prev
          WHERE prev.store_id = p_store_id
            AND prev.customer_email = oc.customer_email
            AND prev.customer_email IS NOT NULL
            AND prev.customer_email != ''
            AND prev.created_at < oc.created_at
        )
        THEN oc.order_id
      END) as first_orders,
      COUNT(DISTINCT oc.order_id) as total_orders
    FROM shopify_orders_cache oc
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li
    WHERE oc.store_id = p_store_id
      AND oc.financial_status NOT IN ('voided', 'refunded')
      AND li->>'product_id' IS NOT NULL
    GROUP BY li->>'product_id'
  ),

  -- Co-occurrence (top co-occurring product per product)
  co_pairs AS (
    SELECT
      li1->>'product_id' as product_id,
      li2->>'product_id' as other_id,
      li2->>'title' as other_title,
      COUNT(DISTINCT oc.order_id) as co_count
    FROM shopify_orders_cache oc
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li1
    CROSS JOIN LATERAL jsonb_array_elements(oc.line_items) as li2
    WHERE oc.store_id = p_store_id
      AND oc.financial_status NOT IN ('voided', 'refunded')
      AND li1->>'product_id' IS NOT NULL
      AND li2->>'product_id' IS NOT NULL
      AND li1->>'product_id' != li2->>'product_id'
    GROUP BY li1->>'product_id', li2->>'product_id', li2->>'title'
  ),
  co_occur AS (
    SELECT DISTINCT ON (cp.product_id)
      cp.product_id,
      cp.other_id as co_occurs_with,
      cp.co_count::numeric / NULLIF(os.total_orders, 0) as co_occur_rate
    FROM co_pairs cp
    JOIN order_stats os ON os.product_id = cp.product_id
    ORDER BY cp.product_id, cp.co_count DESC
  ),

  -- Price threshold (auto-learned from 40th percentile)
  price_threshold AS (
    SELECT
      COALESCE(
        PERCENTILE_CONT(0.4) WITHIN GROUP (ORDER BY avg_price),
        10
      ) as threshold
    FROM order_stats
    WHERE total_orders > 5 AND avg_price > 0
  )

  -- COMBINE ALL SIGNALS
  SELECT
    os.product_id,
    os.title,

    -- PRICE
    ROUND(os.avg_price, 2),
    ROUND(os.min_price, 2),
    ROUND(os.max_price, 2),
    (os.max_price > os.min_price * 3) as has_heavy_discount,
    CASE WHEN os.avg_price >= pt.threshold
      THEN 'above_threshold'
      ELSE 'below_threshold'
    END as price_gap_class,
    ROUND(os.avg_price / NULLIF(st.avg_order_value, 0), 3) as price_ratio_to_order,

    -- ALONE RATE
    os.total_orders,
    COALESCE(als.alone_orders, 0),
    ROUND(COALESCE(als.alone_orders, 0)::numeric / NULLIF(os.total_orders, 0), 3) as alone_rate,

    -- REVENUE
    ROUND(os.total_revenue, 2),
    ROUND(os.total_revenue / NULLIF(st.grand_total, 0), 3) as revenue_share,

    -- CO-OCCURRENCE
    COALESCE(co.co_occur_rate > 0.8, false) as always_with_other,
    ROUND(COALESCE(co.co_occur_rate, 0), 3),
    co.co_occurs_with,

    -- UPSELL STAMPS
    COALESCE(ss.stamped_orders::numeric / NULLIF(ss.total_orders, 0) > 0.3, false) as has_upsell_stamps,

    -- SKU
    CASE
      WHEN os.sku ILIKE ANY(ARRAY['%OTO%','%BUMP%','%UPSELL%','%ADDON%']) THEN 'upsell'
      WHEN os.sku ILIKE ANY(ARRAY['%DS%','%DOWNSELL%']) THEN 'downsell'
      WHEN os.sku ILIKE ANY(ARRAY['%MAIN%','%CORE%','%FE%','%FRONT%']) THEN 'main'
      ELSE null
    END as sku_class,

    -- FIRST PURCHASE
    ROUND(COALESCE(fp.first_orders, 0)::numeric / NULLIF(fp.total_orders, 0), 3),

    -- ORDER POSITION
    ROUND(os.avg_position, 2),
    (os.avg_position > 2) as always_last

  FROM order_stats os
  LEFT JOIN alone_stats als ON als.product_id = os.product_id
  LEFT JOIN stamp_stats ss ON ss.product_id = os.product_id
  LEFT JOIN first_purchase fp ON fp.product_id = os.product_id
  LEFT JOIN co_occur co ON co.product_id = os.product_id
  CROSS JOIN store_total st
  CROSS JOIN price_threshold pt
  WHERE os.total_orders > 2
  ORDER BY os.total_revenue DESC;
$$ LANGUAGE sql STABLE;
