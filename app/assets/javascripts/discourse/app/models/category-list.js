import ArrayProxy from "@ember/array/proxy";
import Category from "discourse/models/category";
import I18n from "I18n";
import PreloadStore from "discourse/lib/preload-store";
import Site from "discourse/models/site";
import Topic from "discourse/models/topic";
import { ajax } from "discourse/lib/ajax";

const CategoryList = ArrayProxy.extend({
  init() {
    this.set("content", []);
    this._super(...arguments);
  },
});

CategoryList.reopenClass({
  categoriesFrom(store, result) {
    const categories = CategoryList.create();
    const list = Category.list();

    let statPeriod = "all";
    const minCategories = result.category_list.categories.length * 0.66;

    ["week", "month"].some((period) => {
      const filteredCategories = result.category_list.categories.filter(
        (c) => c[`topics_${period}`] > 0
      );
      if (filteredCategories.length >= minCategories) {
        statPeriod = period;
        return true;
      }
    });

    result.category_list.categories.forEach((c) => {
      if (c.parent_category_id) {
        c.parentCategory = list.findBy("id", c.parent_category_id);
      }

      if (c.subcategory_ids) {
        c.subcategories = c.subcategory_ids.map((scid) =>
          list.findBy("id", parseInt(scid, 10))
        );
      }

      if (c.topics) {
        c.topics = c.topics.map((t) => Topic.create(t));
      }

      switch (statPeriod) {
        case "week":
        case "month":
          const stat = c[`topics_${statPeriod}`];
          const unit = I18n.t(statPeriod);
          if (stat > 0) {
            c.stat = `<span class="value">${stat}</span> / <span class="unit">${unit}</span>`;

            c.statTitle = I18n.t(
              `categories.topic_stat_sentence_${statPeriod}`,
              {
                count: stat,
              }
            );

            c[
              "pick" + statPeriod[0].toUpperCase() + statPeriod.slice(1)
            ] = true;
            break;
          }
        default:
          c.stat = `<span class="value">${c.topics_all_time}</span>`;
          c.statTitle = I18n.t("categories.topic_sentence", {
            count: c.topics_all_time,
          });
          c.pickAll = true;
          break;
      }

      const record = Site.current().updateCategory(c);
      record.setupGroupsAndPermissions();
      categories.pushObject(record);
    });
    return categories;
  },

  listForParent(store, category) {
    return ajax(
      `/categories.json?parent_category_id=${category.get("id")}`
    ).then((result) => {
      return CategoryList.create({
        categories: this.categoriesFrom(store, result),
        parentCategory: category,
      });
    });
  },

  list(store) {
    const getCategories = () => ajax("/categories.json");
    return PreloadStore.getAndRemove("categories_list", getCategories).then(
      (result) => {
        return CategoryList.create({
          categories: this.categoriesFrom(store, result),
          can_create_category: result.category_list.can_create_category,
          can_create_topic: result.category_list.can_create_topic,
          draft_key: result.category_list.draft_key,
          draft: result.category_list.draft,
          draft_sequence: result.category_list.draft_sequence,
        });
      }
    );
  },
});

export default CategoryList;
